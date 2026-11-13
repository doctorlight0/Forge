//! Forge Escrow Engine
//!
//! Reusable native NEAR escrow contract supporting four workflow modes:
//! - Freelance (single release)
//! - Milestone (multi-step releases)
//! - TimeLocked (release/refund gated by deadlines)
//! - Arbitrated (dispute resolution by designated arbitrator)
//!
//! Security notes:
//! - All amounts are yoctoNEAR integers; no floating point is used anywhere.
//! - Transfers use a push-payment model with private callbacks that restore
//!   liabilities on failure; asynchronous transfers are never treated as atomic.
//! - Storage growth is measured per call via `env::storage_usage` and charged
//!   to the caller's prepaid storage deposit (`storage_deposit`). No user's
//!   deposit subsidizes another user's storage.
//! - Arbitration trust assumption: the contract relies on a single explicitly
//!   selected arbitrator. It is NOT decentralized arbitration; the arbitrator
//!   can allocate the entire remaining balance between buyer and seller.

use borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::UnorderedMap;
use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, Gas, NearToken, PanicOnDefault, Promise,
    PromiseError, PromiseOrValue,
};

pub type EscrowId = u64;
pub type MilestoneId = u32;

/// Current on-chain state structure version. Used for migration awareness:
/// future breaking changes to state must bump this and provide a migration
/// path (e.g. `#[init(ignore_state)]` with state reconstruction).
pub const CONTRACT_VERSION: u32 = 1;

/// Bounded input validation limits.
pub const MAX_DESCRIPTION_LEN: usize = 1000;
pub const MAX_TITLE_LEN: usize = 200;
pub const MAX_REASON_LEN: usize = 500;
pub const MAX_MILESTONE_COUNT: usize = 50;
pub const MAX_PAGE_LIMIT: u64 = 100;

/// Conservative per-operation storage-growth estimate (bytes). Used for a
/// headroom pre-check so that a failed call panics before mutating state
/// (keeps tests deterministic under the near-sdk mock VM, where storage
/// persists across test instances in one binary).
pub const STORAGE_HEADROOM_BYTES: u64 = 8192;

/// Gas prepaid for private transfer-completion callbacks.
pub const GAS_FOR_ON_RELEASE: Gas = Gas::from_tgas(10);
pub const GAS_FOR_ON_REFUND: Gas = Gas::from_tgas(10);

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    Escrows,
    Milestones { escrow_id: EscrowId },
    History { escrow_id: EscrowId },
    AccountEscrows,
    Deposits,
    Used,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(crate = "near_sdk::serde")]
pub enum EscrowKind {
    Freelance,
    Milestone,
    TimeLocked,
    Arbitrated,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, PartialEq, Eq, Debug)]
#[serde(crate = "near_sdk::serde")]
pub enum EscrowStatus {
    Created,
    Funded,
    InProgress,
    PartiallyReleased,
    Disputed,
    Released,
    Refunded,
    Cancelled,
    Resolved,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct Milestone {
    pub id: MilestoneId,
    pub title: String,
    pub amount: U128,
    pub approved: bool,
    pub released: bool,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct HistoryEvent {
    pub ts_ns: U64,
    pub actor: AccountId,
    pub action: String,
    pub note: Option<String>,
}

#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct Escrow {
    pub id: EscrowId,
    pub kind: EscrowKind,
    pub status: EscrowStatus,
    pub buyer: AccountId,
    pub seller: AccountId,
    pub arbitrator: Option<AccountId>,
    pub total_amount: U128,
    pub funded_amount: U128,
    pub released_amount: U128,
    pub refunded_amount: U128,
    pub created_at_ns: U64,
    pub funding_deadline_ns: Option<U64>,
    pub release_deadline_ns: Option<U64>,
    pub description: String,
    pub milestone_count: u32,
    pub dispute_reason: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct CreateEscrowInput {
    pub kind: EscrowKind,
    pub seller: AccountId,
    pub arbitrator: Option<AccountId>,
    pub total_amount: U128,
    pub description: String,
    pub milestones: Option<Vec<MilestoneInput>>,
    pub funding_deadline_ns: Option<U64>,
    pub release_deadline_ns: Option<U64>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct MilestoneInput {
    pub title: String,
    pub amount: U128,
}

/// NEP-145 style storage balance for a single account.
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct StorageBalance {
    pub total: U128,
    pub available: U128,
}

/// NEP-145 style storage balance bounds.
#[derive(BorshDeserialize, BorshSerialize, Serialize, Deserialize, Clone, Debug)]
#[serde(crate = "near_sdk::serde")]
pub struct StorageBalanceBounds {
    pub min: U128,
    pub max: Option<U128>,
}

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct EscrowContract {
    escrows: UnorderedMap<EscrowId, Escrow>,
    milestones: UnorderedMap<EscrowId, Vec<Milestone>>,
    history: UnorderedMap<EscrowId, Vec<HistoryEvent>>,
    account_escrows: UnorderedMap<AccountId, Vec<EscrowId>>,
    storage_deposits: UnorderedMap<AccountId, U128>,
    storage_used: UnorderedMap<AccountId, U128>,
    next_id: EscrowId,
}

#[near]
impl EscrowContract {
    #[init]
    pub fn new() -> Self {
        Self {
            escrows: UnorderedMap::new(StorageKey::Escrows),
            milestones: UnorderedMap::new(StorageKey::Milestones { escrow_id: 0 }),
            history: UnorderedMap::new(StorageKey::History { escrow_id: 0 }),
            account_escrows: UnorderedMap::new(StorageKey::AccountEscrows),
            storage_deposits: UnorderedMap::new(StorageKey::Deposits),
            storage_used: UnorderedMap::new(StorageKey::Used),
            next_id: 1,
        }
    }

    /* ---------------------------------------------------------------- views */

    pub fn get_escrow(&self, escrow_id: EscrowId) -> Option<Escrow> {
        self.escrows.get(&escrow_id)
    }

    pub fn get_milestones(&self, escrow_id: EscrowId) -> Vec<Milestone> {
        self.milestones.get(&escrow_id).unwrap_or_default()
    }

    pub fn get_history(&self, escrow_id: EscrowId) -> Vec<HistoryEvent> {
        self.history.get(&escrow_id).unwrap_or_default()
    }

    pub fn list_escrows(&self, from_index: u64, limit: u64) -> Vec<Escrow> {
        let limit = limit.min(MAX_PAGE_LIMIT);
        let keys: Vec<EscrowId> = self.escrows.keys().collect();
        keys.into_iter()
            .skip(from_index as usize)
            .take(limit as usize)
            .filter_map(|id| self.escrows.get(&id))
            .collect()
    }

    /// Escrows involving `account_id` as buyer, seller or arbitrator, paginated.
    pub fn get_escrows_by_account(
        &self,
        account_id: AccountId,
        from_index: u64,
        limit: u64,
    ) -> Vec<Escrow> {
        let limit = limit.min(MAX_PAGE_LIMIT);
        let ids = self.account_escrows.get(&account_id).unwrap_or_default();
        ids.into_iter()
            .skip(from_index as usize)
            .take(limit as usize)
            .filter_map(|id| self.escrows.get(&id))
            .collect()
    }

    pub fn next_escrow_id(&self) -> EscrowId {
        self.next_id
    }

    pub fn contract_version(&self) -> u32 {
        CONTRACT_VERSION
    }

    pub fn storage_balance_bounds(&self) -> StorageBalanceBounds {
        let min = U128(
            Self::storage_byte_cost().saturating_mul(1024), // ~1 KiB registration estimate
        );
        StorageBalanceBounds { min, max: None }
    }

    pub fn storage_balance_of(&self, account_id: AccountId) -> Option<StorageBalance> {
        if self.storage_deposits.get(&account_id).is_none() {
            return None;
        }
        Some(self.storage_balance_of_internal(&account_id))
    }

    /* ---------------------------------------------------------------- lifecycle */

    pub fn create_escrow(&mut self, input: CreateEscrowInput) -> EscrowId {
        let buyer = env::predecessor_account_id();
        let before = env::storage_usage();
        self.require_storage_registered(&buyer);

        require!(buyer != input.seller, "buyer and seller must differ");
        require!(input.total_amount.0 > 0, "total_amount must be > 0");
        require!(
            input.description.len() <= MAX_DESCRIPTION_LEN,
            "description too long"
        );
        if let Some(a) = &input.arbitrator {
            require!(
                a != &buyer && a != &input.seller,
                "arbitrator must be distinct"
            );
        }
        match input.kind {
            EscrowKind::Arbitrated => {
                require!(input.arbitrator.is_some(), "arbitrator required")
            }
            EscrowKind::TimeLocked => require!(
                input.release_deadline_ns.is_some() || input.funding_deadline_ns.is_some(),
                "time-locked escrow requires a deadline"
            ),
            _ => {}
        }

        let id = self.next_id;
        self.next_id = self.next_id.checked_add(1).expect("escrow id overflow");

        let mut milestone_count = 0u32;
        let mut ms: Vec<Milestone> = Vec::new();
        if matches!(input.kind, EscrowKind::Milestone) {
            let items = input.milestones.clone().unwrap_or_default();
            require!(!items.is_empty(), "milestone escrow requires milestones");
            require!(items.len() <= MAX_MILESTONE_COUNT, "too many milestones");
            let mut sum: u128 = 0;
            for (i, m) in items.iter().enumerate() {
                require!(m.title.len() <= MAX_TITLE_LEN, "milestone title too long");
                require!(m.amount.0 > 0, "milestone amount must be > 0");
                sum = sum.checked_add(m.amount.0).expect("milestone sum overflow");
                ms.push(Milestone {
                    id: i as MilestoneId,
                    title: m.title.clone(),
                    amount: m.amount,
                    approved: false,
                    released: false,
                });
            }
            require!(
                sum == input.total_amount.0,
                "milestone amounts must equal total"
            );
            milestone_count = ms.len() as u32;
            self.milestones.insert(&id, &ms);
        } else if let Some(items) = &input.milestones {
            require!(items.is_empty(), "milestones only valid for Milestone kind");
        }

        let escrow = Escrow {
            id,
            kind: input.kind,
            status: EscrowStatus::Created,
            buyer: buyer.clone(),
            seller: input.seller.clone(),
            arbitrator: input.arbitrator.clone(),
            total_amount: input.total_amount,
            funded_amount: U128(0),
            released_amount: U128(0),
            refunded_amount: U128(0),
            created_at_ns: U64(env::block_timestamp()),
            funding_deadline_ns: input.funding_deadline_ns,
            release_deadline_ns: input.release_deadline_ns,
            description: input.description,
            milestone_count,
            dispute_reason: None,
        };

        self.push_account_escrow(&buyer, id);
        self.push_account_escrow(&input.seller, id);
        if let Some(a) = &input.arbitrator {
            self.push_account_escrow(a, id);
        }
        self.escrows.insert(&id, &escrow);
        self.push_history(id, &buyer, "created", None);
        self.require_storage_allowance(&buyer, before);
        id
    }

    #[payable]
    pub fn fund_escrow(&mut self, escrow_id: EscrowId) {
        let caller = env::predecessor_account_id();
        let before = env::storage_usage();
        self.require_storage_registered(&caller);
        let mut e = self.expect_escrow(escrow_id);
        require!(caller == e.buyer, "only buyer can fund");
        require!(
            matches!(e.status, EscrowStatus::Created),
            "escrow not fundable in current state"
        );
        if let Some(dl) = e.funding_deadline_ns {
            require!(env::block_timestamp() <= dl.0, "funding deadline passed");
        }
        let attached = env::attached_deposit().as_yoctonear();
        require!(
            attached == e.total_amount.0,
            "must attach exact total_amount"
        );
        require!(e.funded_amount.0 == 0, "already funded");
        e.funded_amount = e.total_amount;
        e.status = EscrowStatus::Funded;
        let actor = e.buyer.clone();
        self.escrows.insert(&escrow_id, &e);
        self.push_history(
            escrow_id,
            &actor,
            "funded",
            Some(e.total_amount.0.to_string()),
        );
        self.require_storage_allowance(&caller, before);
    }

    pub fn approve_work(&mut self, escrow_id: EscrowId) {
        let caller = env::predecessor_account_id();
        let before = env::storage_usage();
        self.require_storage_registered(&caller);
        let mut e = self.expect_escrow(escrow_id);
        require!(caller == e.buyer, "only buyer");
        require!(
            matches!(e.status, EscrowStatus::Funded | EscrowStatus::InProgress),
            "cannot approve in current state"
        );
        require!(
            !matches!(e.kind, EscrowKind::Milestone),
            "use approve_milestone for milestone escrows"
        );
        e.status = EscrowStatus::InProgress;
        let actor = e.buyer.clone();
        self.escrows.insert(&escrow_id, &e);
        self.push_history(escrow_id, &actor, "approved", None);
        self.require_storage_allowance(&caller, before);
    }

    pub fn approve_milestone(&mut self, escrow_id: EscrowId, milestone_id: MilestoneId) {
        let caller = env::predecessor_account_id();
        let before = env::storage_usage();
        self.require_storage_registered(&caller);
        let mut e = self.expect_escrow(escrow_id);
        require!(caller == e.buyer, "only buyer");
        require!(
            matches!(e.kind, EscrowKind::Milestone),
            "not a milestone escrow"
        );
        require!(
            matches!(
                e.status,
                EscrowStatus::Funded | EscrowStatus::InProgress | EscrowStatus::PartiallyReleased
            ),
            "cannot approve milestone in current state"
        );
        let mut ms = self.milestones.get(&escrow_id).expect("milestones missing");
        {
            let m = ms
                .get_mut(milestone_id as usize)
                .expect("invalid milestone");
            require!(!m.released, "milestone already released");
            require!(!m.approved, "milestone already approved");
            m.approved = true;
        }
        self.milestones.insert(&escrow_id, &ms);
        if matches!(e.status, EscrowStatus::Funded) {
            e.status = EscrowStatus::InProgress;
        }
        let actor = e.buyer.clone();
        self.escrows.insert(&escrow_id, &e);
        self.push_history(
            escrow_id,
            &actor,
            "milestone_approved",
            Some(milestone_id.to_string()),
        );
        self.require_storage_allowance(&caller, before);
    }

    /// Buyer-initiated release. Push-payment to the seller; the private
    /// `on_release` callback restores liabilities if the transfer fails.
    pub fn release(
        &mut self,
        escrow_id: EscrowId,
        milestone_id: Option<MilestoneId>,
    ) -> PromiseOrValue<()> {
        let caller = env::predecessor_account_id();
        let before = env::storage_usage();
        self.require_storage_registered(&caller);
        let mut e = self.expect_escrow(escrow_id);
        require!(caller == e.buyer, "only buyer");
        require!(
            matches!(
                e.status,
                EscrowStatus::Funded | EscrowStatus::InProgress | EscrowStatus::PartiallyReleased
            ),
            "cannot release in current state"
        );
        if matches!(e.kind, EscrowKind::TimeLocked) {
            if let Some(dl) = e.release_deadline_ns {
                require!(
                    env::block_timestamp() >= dl.0,
                    "release deadline not reached"
                );
            }
        }

        let (amount, label): (u128, String) = match e.kind {
            EscrowKind::Milestone => {
                let mid = milestone_id.expect("milestone_id required for milestone escrows");
                let mut ms = self.milestones.get(&escrow_id).expect("milestones missing");
                let amount = {
                    let m = ms.get_mut(mid as usize).expect("invalid milestone");
                    require!(m.approved, "milestone not approved");
                    require!(!m.released, "milestone already released");
                    m.released = true;
                    m.amount.0
                };
                self.milestones.insert(&escrow_id, &ms);
                (amount, format!("milestone:{mid}"))
            }
            _ => {
                require!(
                    milestone_id.is_none(),
                    "milestone_id only for milestone escrows"
                );
                let available = self.available_balance(&e);
                require!(available > 0, "nothing to release");
                (available, "full".to_string())
            }
        };

        require!(amount > 0, "release amount must be > 0");
        let available_before = self.available_balance(&e);
        require!(
            amount <= available_before,
            "release exceeds available balance"
        );

        e.released_amount = U128(
            e.released_amount
                .0
                .checked_add(amount)
                .expect("released amount overflow"),
        );
        let remaining = self.available_balance(&e);
        if remaining == 0 {
            e.status = EscrowStatus::Released;
        } else if matches!(e.kind, EscrowKind::Milestone) {
            e.status = EscrowStatus::PartiallyReleased;
        }
        let seller = e.seller.clone();
        self.escrows.insert(&escrow_id, &e);
        self.push_history(escrow_id, &caller, "release_requested", Some(label.clone()));
        self.require_storage_allowance(&caller, before);

        PromiseOrValue::Promise(
            Promise::new(seller)
                .transfer(NearToken::from_yoctonear(amount))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_FOR_ON_RELEASE)
                        .on_release(escrow_id, amount),
                ),
        )
    }

    pub fn cancel(&mut self, escrow_id: EscrowId) {
        let caller = env::predecessor_account_id();
        let before = env::storage_usage();
        self.require_storage_registered(&caller);
        let mut e = self.expect_escrow(escrow_id);
        require!(caller == e.buyer, "only buyer");
        require!(
            e.status == EscrowStatus::Created,
            "only created escrow can be cancelled"
        );
        require!(e.funded_amount.0 == 0, "funded escrow cannot be cancelled");
        e.status = EscrowStatus::Cancelled;
        self.escrows.insert(&escrow_id, &e);
        self.push_history(escrow_id, &caller, "cancelled", None);
        self.require_storage_allowance(&caller, before);
    }

    /// Refund the unreleased balance to the buyer. Authorized for the buyer or
    /// the arbitrator. Time-locked escrows can only be refunded by the
    /// arbitrator before the release deadline.
    pub fn refund(&mut self, escrow_id: EscrowId) -> PromiseOrValue<()> {
        let caller = env::predecessor_account_id();
        let before = env::storage_usage();
        self.require_storage_registered(&caller);
        let mut e = self.expect_escrow(escrow_id);
        require!(
            caller == e.buyer || e.arbitrator.as_ref() == Some(&caller),
            "only buyer or arbitrator can refund"
        );
        require!(
            matches!(
                e.status,
                EscrowStatus::Funded | EscrowStatus::InProgress | EscrowStatus::Disputed
            ),
            "cannot refund in current state"
        );
        require!(
            e.released_amount.0 == 0,
            "cannot refund after any release (use dispute/resolution)"
        );
        require!(e.refunded_amount.0 == 0, "duplicate refund");
        let amount = self.available_balance(&e);
        require!(amount > 0, "nothing to refund");
        if matches!(e.kind, EscrowKind::TimeLocked) {
            if let Some(dl) = e.release_deadline_ns {
                if env::block_timestamp() < dl.0 && e.arbitrator.as_ref() != Some(&caller) {
                    require!(false, "time-locked: refund before unlock deadline");
                }
            }
        }
        let prior_status = e.status;
        e.refunded_amount = U128(amount);
        e.status = EscrowStatus::Refunded;
        let buyer = e.buyer.clone();
        self.escrows.insert(&escrow_id, &e);
        self.push_history(
            escrow_id,
            &caller,
            "refund_requested",
            Some(amount.to_string()),
        );
        self.require_storage_allowance(&caller, before);

        PromiseOrValue::Promise(
            Promise::new(buyer)
                .transfer(NearToken::from_yoctonear(amount))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_FOR_ON_REFUND)
                        .on_refund(escrow_id, amount, prior_status),
                ),
        )
    }

    pub fn raise_dispute(&mut self, escrow_id: EscrowId, reason: String) {
        let caller = env::predecessor_account_id();
        let before = env::storage_usage();
        require!(reason.len() <= MAX_REASON_LEN, "dispute reason too long");
        let mut e = self.expect_escrow(escrow_id);
        require!(
            caller == e.buyer || caller == e.seller,
            "only participants can dispute"
        );
        require!(e.arbitrator.is_some(), "no arbitrator configured");
        require!(
            matches!(
                e.status,
                EscrowStatus::Funded | EscrowStatus::InProgress | EscrowStatus::PartiallyReleased
            ),
            "cannot dispute in current state"
        );
        e.status = EscrowStatus::Disputed;
        e.dispute_reason = Some(reason.clone());
        self.escrows.insert(&escrow_id, &e);
        self.push_history(escrow_id, &caller, "disputed", e.dispute_reason.clone());
        self.require_storage_allowance(&caller, before);
    }

    /// Arbitrator allocates the full available balance between seller release
    /// and buyer refund. Amounts must sum to exactly the available balance and
    /// are each bounded by it, so the arbitrator cannot exceed the escrow's
    /// actual remaining funds.
    pub fn resolve_dispute(
        &mut self,
        escrow_id: EscrowId,
        release_to_seller: U128,
        refund_to_buyer: U128,
    ) -> PromiseOrValue<()> {
        let caller = env::predecessor_account_id();
        let before = env::storage_usage();
        self.require_storage_registered(&caller);
        let mut e = self.expect_escrow(escrow_id);
        require!(e.arbitrator.as_ref() == Some(&caller), "only arbitrator");
        require!(e.status == EscrowStatus::Disputed, "escrow not disputed");
        let available = self.available_balance(&e);
        let total = release_to_seller
            .0
            .checked_add(refund_to_buyer.0)
            .expect("resolution sum overflow");
        require!(
            total == available,
            "resolution amounts must equal available balance"
        );
        require!(
            release_to_seller.0 <= available && refund_to_buyer.0 <= available,
            "allocation exceeds available balance"
        );

        e.released_amount = U128(
            e.released_amount
                .0
                .checked_add(release_to_seller.0)
                .expect("overflow"),
        );
        e.refunded_amount = U128(
            e.refunded_amount
                .0
                .checked_add(refund_to_buyer.0)
                .expect("overflow"),
        );
        e.status = EscrowStatus::Resolved;
        e.dispute_reason = None;
        let seller = e.seller.clone();
        let buyer = e.buyer.clone();
        self.escrows.insert(&escrow_id, &e);
        self.push_history(
            escrow_id,
            &caller,
            "resolved",
            Some(format!(
                "seller:{},buyer:{}",
                release_to_seller.0, refund_to_buyer.0
            )),
        );
        self.require_storage_allowance(&caller, before);

        if release_to_seller.0 > 0 && refund_to_buyer.0 > 0 {
            let p_seller = Promise::new(seller)
                .transfer(NearToken::from_yoctonear(release_to_seller.0))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_FOR_ON_RELEASE)
                        .on_release(escrow_id, release_to_seller.0),
                );
            let p_buyer = Promise::new(buyer)
                .transfer(NearToken::from_yoctonear(refund_to_buyer.0))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_FOR_ON_REFUND)
                        .on_refund(escrow_id, refund_to_buyer.0, EscrowStatus::Disputed),
                );
            PromiseOrValue::Promise(p_seller.and(p_buyer))
        } else if release_to_seller.0 > 0 {
            PromiseOrValue::Promise(
                Promise::new(seller)
                    .transfer(NearToken::from_yoctonear(release_to_seller.0))
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(GAS_FOR_ON_RELEASE)
                            .on_release(escrow_id, release_to_seller.0),
                    ),
            )
        } else {
            PromiseOrValue::Promise(
                Promise::new(buyer)
                    .transfer(NearToken::from_yoctonear(refund_to_buyer.0))
                    .then(
                        Self::ext(env::current_account_id())
                            .with_static_gas(GAS_FOR_ON_REFUND)
                            .on_refund(escrow_id, refund_to_buyer.0, EscrowStatus::Disputed),
                    ),
            )
        }
    }

    /* ---------------------------------------------------------------- private callbacks */

    #[private]
    pub fn on_release(
        &mut self,
        escrow_id: EscrowId,
        amount: u128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        match result {
            Ok(()) => true,
            Err(err) => {
                // Restore the liability earmarked before the transfer. The
                // escrow returns to its pre-release state so the buyer can
                // retry or move to dispute.
                if let Some(mut e) = self.escrows.get(&escrow_id) {
                    let prior = e.released_amount.0;
                    e.released_amount = U128(prior.saturating_sub(amount));
                    let was_resolved = matches!(e.status, EscrowStatus::Resolved);
                    if e.released_amount.0 == 0 {
                        e.status = if was_resolved {
                            EscrowStatus::Disputed
                        } else {
                            EscrowStatus::InProgress
                        };
                    } else if matches!(
                        e.status,
                        EscrowStatus::Released | EscrowStatus::PartiallyReleased
                    ) {
                        e.status = if was_resolved {
                            EscrowStatus::Disputed
                        } else {
                            EscrowStatus::PartiallyReleased
                        };
                    }
                    self.escrows.insert(&escrow_id, &e);
                }
                let _ = err;
                false
            }
        }
    }

    #[private]
    pub fn on_refund(
        &mut self,
        escrow_id: EscrowId,
        amount: u128,
        prior_status: EscrowStatus,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        match result {
            Ok(()) => true,
            Err(err) => {
                if let Some(mut e) = self.escrows.get(&escrow_id) {
                    e.refunded_amount = U128(e.refunded_amount.0.saturating_sub(amount));
                    e.status = prior_status;
                    self.escrows.insert(&escrow_id, &e);
                }
                let _ = err;
                false
            }
        }
    }

    #[private]
    pub fn on_storage_withdraw(
        &mut self,
        account: AccountId,
        amount: u128,
        _prior_deposit: U128,
        #[callback_result] result: Result<(), PromiseError>,
    ) -> bool {
        match result {
            Ok(()) => true,
            Err(_err) => {
                if let Some(mut deposit) = self.storage_deposits.get(&account) {
                    deposit = U128(
                        deposit
                            .0
                            .checked_add(amount)
                            .expect("storage deposit restore overflow"),
                    );
                    self.storage_deposits.insert(&account, &deposit);
                    // `used` already excludes `amount`; restoring the deposit
                    // re-balances `available = deposit - used`.
                }
                false
            }
        }
    }

    /* ---------------------------------------------------------------- storage accounting */

    pub fn storage_deposit(&mut self, account_id: Option<AccountId>) -> StorageBalance {
        let account = account_id.unwrap_or_else(|| env::predecessor_account_id());
        let before = env::storage_usage();
        let attached = env::attached_deposit().as_yoctonear();
        require!(attached > 0, "attached deposit must be positive");
        let mut deposit = self.storage_deposits.get(&account).unwrap_or(U128(0));
        deposit = U128(deposit.0.checked_add(attached).expect("overflow"));
        self.storage_deposits.insert(&account, &deposit);

        let used = self.storage_used.get(&account).unwrap_or(U128(0));
        let existed = self.storage_used.get(&account).is_some();
        if !existed {
            self.storage_used.insert(&account, &U128(0));
        }

        let after1 = env::storage_usage();
        let delta1 = after1.saturating_sub(before) as u128;
        let cost1 = delta1
            .checked_mul(Self::storage_byte_cost())
            .expect("storage cost overflow");
        let new_used = used.0.checked_add(cost1).expect("overflow");
        require!(
            deposit.0 >= new_used,
            "attached deposit does not cover storage cost"
        );

        if !existed {
            self.storage_used.insert(&account, &U128(new_used));
            let after2 = env::storage_usage();
            let delta2 = after2.saturating_sub(after1) as u128;
            let cost2 = delta2
                .checked_mul(Self::storage_byte_cost())
                .expect("storage cost overflow");
            let final_used = new_used.checked_add(cost2).expect("overflow");
            require!(
                deposit.0 >= final_used,
                "attached deposit does not cover storage cost"
            );
            self.storage_used.insert(&account, &U128(final_used));
        } else {
            self.storage_used.insert(&account, &U128(new_used));
        }
        self.storage_balance_of_internal(&account)
    }

    pub fn storage_withdraw(&mut self, amount: Option<U128>) -> PromiseOrValue<StorageBalance> {
        let account = env::predecessor_account_id();
        let before = env::storage_usage();
        let deposit = self.storage_deposits.get(&account).unwrap_or(U128(0));
        let used = self.storage_used.get(&account).unwrap_or(U128(0));
        require!(deposit.0 >= used.0, "inconsistent storage accounting");
        let available = deposit.0.checked_sub(used.0).expect("underflow");
        let to_withdraw = match amount {
            Some(a) => {
                require!(a.0 > 0, "withdraw amount must be positive");
                require!(
                    a.0 <= available,
                    "withdraw exceeds available storage balance"
                );
                a.0
            }
            None => available,
        };
        require!(to_withdraw > 0, "nothing to withdraw");
        let new_deposit = deposit.0.checked_sub(to_withdraw).expect("underflow");
        self.storage_deposits.insert(&account, &U128(new_deposit));
        self.require_storage_allowance(&account, before);

        PromiseOrValue::Promise(
            Promise::new(account.clone())
                .transfer(NearToken::from_yoctonear(to_withdraw))
                .then(
                    Self::ext(env::current_account_id())
                        .with_static_gas(GAS_FOR_ON_REFUND)
                        .on_storage_withdraw(account, to_withdraw, deposit),
                ),
        )
    }

    /* ---------------------------------------------------------------- helpers */

    fn available_balance(&self, e: &Escrow) -> u128 {
        e.funded_amount
            .0
            .checked_sub(e.released_amount.0)
            .and_then(|v| v.checked_sub(e.refunded_amount.0))
            .expect("escrow accounting underflow")
    }

    /// Phase-A guard: the caller must have registered a storage deposit before
    /// any state mutation. Checked before writes so a failed call leaves the
    /// mock storage clean (real NEAR reverts failed executions anyway).
    fn require_storage_registered(&self, account: &AccountId) {
        require!(
            self.storage_deposits.get(account).is_some(),
            "insufficient storage deposit; call storage_deposit before mutating state"
        );
        self.require_storage_headroom(account);
    }

    /// Headroom pre-check: guarantees the caller can pay for the storage
    /// growth of the upcoming mutation before any write happens.
    fn require_storage_headroom(&self, account: &AccountId) {
        let deposit = self.storage_deposits.get(account).unwrap_or(U128(0));
        let used = self.storage_used.get(account).unwrap_or(U128(0));
        let headroom = (STORAGE_HEADROOM_BYTES as u128)
            .checked_mul(Self::storage_byte_cost())
            .expect("headroom overflow");
        require!(
            deposit.0 >= used.0.checked_add(headroom).expect("overflow"),
            "insufficient storage deposit headroom; call storage_deposit"
        );
    }

    fn require_storage_allowance(&mut self, account: &AccountId, before: u64) {
        let after1 = env::storage_usage();
        let delta1 = after1.saturating_sub(before) as u128;
        let cost1 = delta1
            .checked_mul(Self::storage_byte_cost())
            .expect("storage cost overflow");
        let deposit = self.storage_deposits.get(account).unwrap_or(U128(0));
        let used = self.storage_used.get(account).unwrap_or(U128(0));
        let new_used = used.0.checked_add(cost1).expect("overflow");
        require!(
            deposit.0 >= new_used,
            "insufficient storage deposit; call storage_deposit before mutating state"
        );
        self.storage_used.insert(account, &U128(new_used));
        let after2 = env::storage_usage();
        let delta2 = after2.saturating_sub(after1) as u128;
        let cost2 = delta2
            .checked_mul(Self::storage_byte_cost())
            .expect("storage cost overflow");
        let final_used = new_used.checked_add(cost2).expect("overflow");
        require!(
            deposit.0 >= final_used,
            "insufficient storage deposit; call storage_deposit before mutating state"
        );
        self.storage_used.insert(account, &U128(final_used));
    }

    fn push_account_escrow(&mut self, account: &AccountId, escrow_id: EscrowId) {
        let mut vec = self.account_escrows.get(account).unwrap_or_default();
        require!(
            vec.len() < u32::MAX as usize,
            "account escrow index overflow"
        );
        vec.push(escrow_id);
        self.account_escrows.insert(account, &vec);
    }

    fn push_history(
        &mut self,
        escrow_id: EscrowId,
        actor: &AccountId,
        action: &str,
        note: Option<String>,
    ) {
        let mut h = self.history.get(&escrow_id).unwrap_or_default();
        h.push(HistoryEvent {
            ts_ns: U64(env::block_timestamp()),
            actor: actor.clone(),
            action: action.to_string(),
            note,
        });
        self.history.insert(&escrow_id, &h);
    }

    fn storage_byte_cost() -> u128 {
        env::storage_byte_cost().as_yoctonear()
    }

    fn storage_balance_of_internal(&self, account: &AccountId) -> StorageBalance {
        let deposit = self.storage_deposits.get(account).unwrap_or(U128(0));
        let used = self.storage_used.get(account).unwrap_or(U128(0));
        let available = deposit
            .0
            .checked_sub(used.0)
            .expect("storage used exceeds deposit");
        StorageBalance {
            total: deposit,
            available: U128(available),
        }
    }

    fn expect_escrow(&self, escrow_id: EscrowId) -> Escrow {
        self.escrows.get(&escrow_id).expect("escrow not found")
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::{testing_env, PromiseError};

    const STORAGE_ATTACH: u128 = 1_000_000_000_000_000_000_000_000; // 1 NEAR

    fn ctx(predecessor: AccountId, attached: NearToken, ts: u64) {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor.clone());
        builder.signer_account_id(predecessor);
        builder.attached_deposit(attached);
        builder.block_timestamp(ts);
        testing_env!(builder.build());
    }

    fn register_storage(c: &mut EscrowContract, account: AccountId) {
        ctx(
            account.clone(),
            NearToken::from_yoctonear(STORAGE_ATTACH),
            100,
        );
        c.storage_deposit(None);
    }

    fn freelance_input(seller: AccountId, amount: u128) -> CreateEscrowInput {
        CreateEscrowInput {
            kind: EscrowKind::Freelance,
            seller,
            arbitrator: None,
            total_amount: U128(amount),
            description: "job".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: None,
        }
    }

    fn create_freelance_funded(
        c: &mut EscrowContract,
        buyer: AccountId,
        seller: AccountId,
        amount: u128,
        ts: u64,
    ) -> EscrowId {
        register_storage(c, buyer.clone());
        ctx(buyer.clone(), NearToken::from_yoctonear(0), ts);
        let id = c.create_escrow(freelance_input(seller.clone(), amount));
        ctx(buyer, NearToken::from_yoctonear(amount), ts + 1);
        c.fund_escrow(id);
        id
    }

    #[test]
    fn storage_balance_bounds_returned() {
        let c = EscrowContract::new();
        let bounds = c.storage_balance_bounds();
        assert!(bounds.min.0 > 0);
        assert!(bounds.max.is_none());
    }

    #[test]
    fn storage_deposit_credits_balance() {
        let mut c = EscrowContract::new();
        ctx(accounts(5), NearToken::from_yoctonear(STORAGE_ATTACH), 10);
        let before = c.storage_deposit(None);
        assert_eq!(before.total.0, STORAGE_ATTACH);
        assert!(before.available.0 > 0);
        assert!(before.available.0 <= before.total.0);
        let got = c.storage_balance_of(accounts(5)).unwrap();
        assert_eq!(got.total, before.total);
    }

    #[test]
    fn storage_withdraw_excess_returns_funds() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(4));
        let before = c.storage_balance_of(accounts(4)).unwrap();
        ctx(accounts(4), NearToken::from_yoctonear(0), 101);
        let out = c.storage_withdraw(None);
        match out {
            PromiseOrValue::Promise(_) => {}
            PromiseOrValue::Value(v) => {
                assert_eq!(v.available.0, 0);
                assert!(v.total.0 < before.total.0);
            }
        }
        let after = c.storage_balance_of(accounts(4)).unwrap();
        assert_eq!(after.available.0, 0);
        assert!(after.total.0 < before.total.0);
    }

    #[test]
    #[should_panic(expected = "nothing to withdraw")]
    fn storage_withdraw_nothing_panics() {
        let mut c = EscrowContract::new();
        ctx(accounts(3), NearToken::from_yoctonear(0), 10);
        c.storage_withdraw(None);
    }

    #[test]
    #[should_panic(expected = "insufficient storage deposit")]
    fn create_escrow_requires_storage_deposit() {
        let mut c = EscrowContract::new();
        ctx(accounts(3), NearToken::from_yoctonear(0), 10);
        c.create_escrow(freelance_input(accounts(1), 100));
    }

    #[test]
    fn create_and_fund_freelance() {
        let mut c = EscrowContract::new();
        let id = create_freelance_funded(&mut c, accounts(0), accounts(1), 100, 10);
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.status, EscrowStatus::Funded);
        assert_eq!(e.funded_amount.0, 100);
    }

    #[test]
    #[should_panic(expected = "buyer and seller must differ")]
    fn rejects_same_buyer_seller() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0));
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        c.create_escrow(freelance_input(accounts(0), 100));
    }

    #[test]
    #[should_panic(expected = "total_amount must be > 0")]
    fn rejects_zero_total() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0));
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        c.create_escrow(freelance_input(accounts(1), 0));
    }

    #[test]
    #[should_panic(expected = "arbitrator required")]
    fn arbitrated_requires_arbitrator() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0));
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Arbitrated,
            seller: accounts(1),
            arbitrator: None,
            total_amount: U128(100),
            description: "a".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        c.create_escrow(input);
    }

    #[test]
    #[should_panic(expected = "arbitrator must be distinct")]
    fn arbitrator_must_be_distinct() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0));
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Arbitrated,
            seller: accounts(1),
            arbitrator: Some(accounts(0)),
            total_amount: U128(100),
            description: "a".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        c.create_escrow(input);
    }

    #[test]
    #[should_panic(expected = "time-locked escrow requires a deadline")]
    fn timelock_requires_deadline() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0));
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::TimeLocked,
            seller: accounts(1),
            arbitrator: None,
            total_amount: U128(100),
            description: "a".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        c.create_escrow(input);
    }

    #[test]
    #[should_panic(expected = "milestone amounts must equal total")]
    fn milestone_sum_must_equal_total() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0));
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Milestone,
            seller: accounts(1),
            arbitrator: None,
            total_amount: U128(100),
            description: "m".into(),
            milestones: Some(vec![
                MilestoneInput {
                    title: "a".into(),
                    amount: U128(60),
                },
                MilestoneInput {
                    title: "b".into(),
                    amount: U128(30),
                },
            ]),
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        c.create_escrow(input);
    }

    #[test]
    #[should_panic(expected = "milestone escrow requires milestones")]
    fn milestone_requires_items() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0));
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Milestone,
            seller: accounts(1),
            arbitrator: None,
            total_amount: U128(100),
            description: "m".into(),
            milestones: Some(vec![]),
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        c.create_escrow(input);
    }

    #[test]
    #[should_panic(expected = "milestones only valid for Milestone kind")]
    fn milestones_rejected_for_freelance() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0));
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let mut input = freelance_input(accounts(1), 100);
        input.milestones = Some(vec![MilestoneInput {
            title: "a".into(),
            amount: U128(100),
        }]);
        c.create_escrow(input);
    }

    #[test]
    #[should_panic(expected = "description too long")]
    fn description_too_long_rejected() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0));
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let mut input = freelance_input(accounts(1), 100);
        input.description = "x".repeat(MAX_DESCRIPTION_LEN + 1);
        c.create_escrow(input);
    }

    #[test]
    #[should_panic(expected = "too many milestones")]
    fn too_many_milestones_rejected() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0));
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let items: Vec<MilestoneInput> = (0..MAX_MILESTONE_COUNT + 1)
            .map(|i| MilestoneInput {
                title: format!("m{i}"),
                amount: U128(1),
            })
            .collect();
        let input = CreateEscrowInput {
            kind: EscrowKind::Milestone,
            seller: accounts(1),
            arbitrator: None,
            total_amount: U128((MAX_MILESTONE_COUNT + 1) as u128),
            description: "m".into(),
            milestones: Some(items),
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        c.create_escrow(input);
    }

    #[test]
    #[should_panic(expected = "must attach exact total_amount")]
    fn wrong_deposit_rejected() {
        let mut c = EscrowContract::new();
        let id = create_freelance_funded(&mut c, accounts(0), accounts(1), 100, 10);
        let _ = id;
        // second escrow, wrong attached amount
        register_storage(&mut c, accounts(0));
        ctx(accounts(0), NearToken::from_yoctonear(0), 20);
        let id2 = c.create_escrow(freelance_input(accounts(1), 100));
        ctx(accounts(0), NearToken::from_yoctonear(50), 21);
        c.fund_escrow(id2);
    }

    #[test]
    #[should_panic(expected = "only buyer can fund")]
    fn non_buyer_cannot_fund() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let id2 = c.create_escrow(freelance_input(accounts(1), 100));
        register_storage(&mut c, accounts(2));
        ctx(accounts(2), NearToken::from_yoctonear(100), 20);
        c.fund_escrow(id2);
    }

    #[test]
    #[should_panic(expected = "escrow not fundable in current state")]
    fn double_fund_blocked() {
        let mut c = EscrowContract::new();
        let id = create_freelance_funded(&mut c, accounts(0), accounts(1), 100, 10);
        ctx(accounts(0), NearToken::from_yoctonear(100), 20);
        c.fund_escrow(id);
    }

    #[test]
    fn freelance_release_full_pays_seller() {
        let mut c = EscrowContract::new();
        let id = create_freelance_funded(&mut c, accounts(0), accounts(1), 100, 10);
        ctx(accounts(0), NearToken::from_yoctonear(0), 11);
        let _ = c.release(id, None);
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.status, EscrowStatus::Released);
        assert_eq!(e.released_amount.0, 100);
        assert_eq!(e.available_balance_if_public(), 0);
    }

    #[test]
    #[should_panic(expected = "cannot release in current state")]
    fn double_release_blocked() {
        let mut c = EscrowContract::new();
        let id = create_freelance_funded(&mut c, accounts(0), accounts(1), 100, 10);
        ctx(accounts(0), NearToken::from_yoctonear(0), 11);
        let _ = c.release(id, None);
        ctx(accounts(0), NearToken::from_yoctonear(0), 12);
        let _ = c.release(id, None);
    }

    #[test]
    #[should_panic(expected = "only buyer")]
    fn non_buyer_cannot_release() {
        let mut c = EscrowContract::new();
        let id = create_freelance_funded(&mut c, accounts(0), accounts(1), 100, 10);
        register_storage(&mut c, accounts(2).clone());
        ctx(accounts(2), NearToken::from_yoctonear(0), 11);
        let _ = c.release(id, None);
    }

    #[test]
    fn milestone_multi_release_flow() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Milestone,
            seller: accounts(1),
            arbitrator: None,
            total_amount: U128(300),
            description: "m".into(),
            milestones: Some(vec![
                MilestoneInput {
                    title: "a".into(),
                    amount: U128(100),
                },
                MilestoneInput {
                    title: "b".into(),
                    amount: U128(200),
                },
            ]),
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(300), 11);
        c.fund_escrow(id);
        ctx(accounts(0), NearToken::from_yoctonear(0), 12);
        c.approve_milestone(id, 0);
        let _ = c.release(id, Some(0));
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.released_amount.0, 100);
        assert_eq!(e.status, EscrowStatus::PartiallyReleased);
        // accounting invariant: funded == released + refunded + remaining
        assert_eq!(
            e.funded_amount.0,
            e.released_amount.0 + e.refunded_amount.0 + 200
        );

        ctx(accounts(0), NearToken::from_yoctonear(0), 13);
        c.approve_milestone(id, 1);
        let _ = c.release(id, Some(1));
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.status, EscrowStatus::Released);
        assert_eq!(e.released_amount.0, 300);
        assert_eq!(e.funded_amount.0, e.released_amount.0 + e.refunded_amount.0);
    }

    #[test]
    #[should_panic(expected = "milestone not approved")]
    fn release_unapproved_milestone_blocked() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Milestone,
            seller: accounts(1),
            arbitrator: None,
            total_amount: U128(100),
            description: "m".into(),
            milestones: Some(vec![MilestoneInput {
                title: "a".into(),
                amount: U128(100),
            }]),
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(0), NearToken::from_yoctonear(0), 12);
        let _ = c.release(id, Some(0));
    }

    #[test]
    #[should_panic(expected = "milestone already released")]
    fn duplicate_milestone_release_blocked() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Milestone,
            seller: accounts(1),
            arbitrator: None,
            total_amount: U128(200),
            description: "m".into(),
            milestones: Some(vec![
                MilestoneInput {
                    title: "a".into(),
                    amount: U128(100),
                },
                MilestoneInput {
                    title: "b".into(),
                    amount: U128(100),
                },
            ]),
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(200), 11);
        c.fund_escrow(id);
        ctx(accounts(0), NearToken::from_yoctonear(0), 12);
        c.approve_milestone(id, 0);
        let _ = c.release(id, Some(0));
        ctx(accounts(0), NearToken::from_yoctonear(0), 13);
        let _ = c.release(id, Some(0));
    }

    #[test]
    #[should_panic(expected = "release deadline not reached")]
    fn time_locked_release_before_deadline_blocked() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::TimeLocked,
            seller: accounts(1),
            arbitrator: None,
            total_amount: U128(100),
            description: "tl".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: Some(U64(1000)),
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(0), NearToken::from_yoctonear(0), 500);
        c.approve_work(id);
        let _ = c.release(id, None);
    }

    #[test]
    fn time_locked_release_after_deadline_ok() {
        let mut c = EscrowContract::new();
        let id = {
            register_storage(&mut c, accounts(0).clone());
            ctx(accounts(0), NearToken::from_yoctonear(0), 10);
            let input = CreateEscrowInput {
                kind: EscrowKind::TimeLocked,
                seller: accounts(1),
                arbitrator: None,
                total_amount: U128(100),
                description: "tl".into(),
                milestones: None,
                funding_deadline_ns: None,
                release_deadline_ns: Some(U64(1000)),
            };
            c.create_escrow(input)
        };
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(0), NearToken::from_yoctonear(0), 1500);
        c.approve_work(id);
        let _ = c.release(id, None);
        assert_eq!(c.get_escrow(id).unwrap().status, EscrowStatus::Released);
    }

    #[test]
    #[should_panic(expected = "funding deadline passed")]
    fn funding_deadline_enforced() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let id = c.create_escrow(CreateEscrowInput {
            kind: EscrowKind::Freelance,
            seller: accounts(1),
            arbitrator: None,
            total_amount: U128(100),
            description: "x".into(),
            milestones: None,
            funding_deadline_ns: Some(U64(100)),
            release_deadline_ns: None,
        });
        ctx(accounts(0), NearToken::from_yoctonear(100), 200);
        c.fund_escrow(id);
    }

    #[test]
    fn cancel_unfunded() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let id = c.create_escrow(freelance_input(accounts(1), 100));
        c.cancel(id);
        assert_eq!(c.get_escrow(id).unwrap().status, EscrowStatus::Cancelled);
    }

    #[test]
    #[should_panic(expected = "only created escrow can be cancelled")]
    fn cancel_funded_blocked() {
        let mut c = EscrowContract::new();
        let id = create_freelance_funded(&mut c, accounts(0), accounts(1), 100, 10);
        ctx(accounts(0), NearToken::from_yoctonear(0), 20);
        c.cancel(id);
    }

    #[test]
    #[should_panic(expected = "only buyer")]
    fn cancel_non_buyer_blocked() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let id = c.create_escrow(freelance_input(accounts(1), 100));
        register_storage(&mut c, accounts(2).clone());
        ctx(accounts(2), NearToken::from_yoctonear(0), 20);
        c.cancel(id);
    }

    #[test]
    fn refund_funded_by_buyer() {
        let mut c = EscrowContract::new();
        let id = create_freelance_funded(&mut c, accounts(0), accounts(1), 100, 10);
        ctx(accounts(0), NearToken::from_yoctonear(0), 20);
        let _ = c.refund(id);
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.status, EscrowStatus::Refunded);
        assert_eq!(e.refunded_amount.0, 100);
        assert_eq!(e.funded_amount.0, e.released_amount.0 + e.refunded_amount.0);
    }

    #[test]
    #[should_panic(expected = "cannot refund in current state")]
    fn refund_after_release_blocked() {
        let mut c = EscrowContract::new();
        let id = create_freelance_funded(&mut c, accounts(0), accounts(1), 100, 10);
        ctx(accounts(0), NearToken::from_yoctonear(0), 20);
        let _ = c.release(id, None);
        ctx(accounts(0), NearToken::from_yoctonear(0), 21);
        let _ = c.refund(id);
    }

    #[test]
    #[should_panic(expected = "cannot refund in current state")]
    fn duplicate_refund_blocked() {
        let mut c = EscrowContract::new();
        let id = create_freelance_funded(&mut c, accounts(0), accounts(1), 100, 10);
        ctx(accounts(0), NearToken::from_yoctonear(0), 20);
        let _ = c.refund(id);
        ctx(accounts(0), NearToken::from_yoctonear(0), 21);
        let _ = c.refund(id);
    }

    #[test]
    #[should_panic(expected = "only buyer or arbitrator can refund")]
    fn seller_cannot_refund() {
        let mut c = EscrowContract::new();
        let id = create_freelance_funded(&mut c, accounts(0), accounts(1), 100, 10);
        register_storage(&mut c, accounts(1).clone());
        ctx(accounts(1), NearToken::from_yoctonear(0), 20);
        let _ = c.refund(id);
    }

    #[test]
    fn refund_time_locked_before_deadline_by_arb_ok() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        register_storage(&mut c, accounts(2).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::TimeLocked,
            seller: accounts(1),
            arbitrator: Some(accounts(2)),
            total_amount: U128(100),
            description: "tl".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: Some(U64(1000)),
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(2), NearToken::from_yoctonear(0), 500);
        let _ = c.refund(id);
        assert_eq!(c.get_escrow(id).unwrap().status, EscrowStatus::Refunded);
    }

    #[test]
    #[should_panic(expected = "time-locked: refund before unlock deadline")]
    fn refund_time_locked_before_deadline_by_buyer_blocked() {
        let mut c = EscrowContract::new();
        let id = {
            register_storage(&mut c, accounts(0).clone());
            ctx(accounts(0), NearToken::from_yoctonear(0), 10);
            let input = CreateEscrowInput {
                kind: EscrowKind::TimeLocked,
                seller: accounts(1),
                arbitrator: None,
                total_amount: U128(100),
                description: "tl".into(),
                milestones: None,
                funding_deadline_ns: None,
                release_deadline_ns: Some(U64(1000)),
            };
            c.create_escrow(input)
        };
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(0), NearToken::from_yoctonear(0), 500);
        let _ = c.refund(id);
    }

    #[test]
    fn dispute_flow_transitions() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        register_storage(&mut c, accounts(1).clone());
        register_storage(&mut c, accounts(2).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Arbitrated,
            seller: accounts(1),
            arbitrator: Some(accounts(2)),
            total_amount: U128(100),
            description: "arb".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(1), NearToken::from_yoctonear(0), 12);
        c.raise_dispute(id, "late delivery".into());
        assert_eq!(c.get_escrow(id).unwrap().status, EscrowStatus::Disputed);
        ctx(accounts(2), NearToken::from_yoctonear(0), 13);
        let _ = c.resolve_dispute(id, U128(60), U128(40));
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.status, EscrowStatus::Resolved);
        assert_eq!(e.released_amount.0, 60);
        assert_eq!(e.refunded_amount.0, 40);
        assert_eq!(e.funded_amount.0, e.released_amount.0 + e.refunded_amount.0);
    }

    #[test]
    #[should_panic(expected = "no arbitrator configured")]
    fn dispute_without_arbitrator_blocked() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let id = c.create_escrow(freelance_input(accounts(1), 100));
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(1), NearToken::from_yoctonear(0), 12);
        c.raise_dispute(id, "x".into());
    }

    #[test]
    fn dispute_by_buyer_or_seller() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        register_storage(&mut c, accounts(1).clone());
        register_storage(&mut c, accounts(2).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Arbitrated,
            seller: accounts(1),
            arbitrator: Some(accounts(2)),
            total_amount: U128(100),
            description: "arb".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        // seller raises
        ctx(accounts(1), NearToken::from_yoctonear(0), 12);
        c.raise_dispute(id, "seller side".into());
        assert_eq!(c.get_escrow(id).unwrap().status, EscrowStatus::Disputed);
    }

    #[test]
    #[should_panic(expected = "cannot dispute in current state")]
    fn dispute_after_release_blocked() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        register_storage(&mut c, accounts(1).clone());
        register_storage(&mut c, accounts(2).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Arbitrated,
            seller: accounts(1),
            arbitrator: Some(accounts(2)),
            total_amount: U128(100),
            description: "arb".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(0), NearToken::from_yoctonear(0), 12);
        let _ = c.release(id, None);
        ctx(accounts(1), NearToken::from_yoctonear(0), 13);
        c.raise_dispute(id, "x".into());
    }

    #[test]
    #[should_panic(expected = "only arbitrator")]
    fn non_arbitrator_cannot_resolve() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        register_storage(&mut c, accounts(1).clone());
        register_storage(&mut c, accounts(2).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Arbitrated,
            seller: accounts(1),
            arbitrator: Some(accounts(2)),
            total_amount: U128(100),
            description: "arb".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(1), NearToken::from_yoctonear(0), 12);
        c.raise_dispute(id, "x".into());
        ctx(accounts(0), NearToken::from_yoctonear(0), 13);
        let _ = c.resolve_dispute(id, U128(100), U128(0));
    }

    #[test]
    #[should_panic(expected = "escrow not disputed")]
    fn resolve_without_dispute_blocked() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        register_storage(&mut c, accounts(1).clone());
        register_storage(&mut c, accounts(2).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Arbitrated,
            seller: accounts(1),
            arbitrator: Some(accounts(2)),
            total_amount: U128(100),
            description: "arb".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(2), NearToken::from_yoctonear(0), 13);
        let _ = c.resolve_dispute(id, U128(100), U128(0));
    }

    #[test]
    #[should_panic(expected = "resolution amounts must equal available balance")]
    fn resolve_split_mismatch_blocked() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        register_storage(&mut c, accounts(1).clone());
        register_storage(&mut c, accounts(2).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Arbitrated,
            seller: accounts(1),
            arbitrator: Some(accounts(2)),
            total_amount: U128(100),
            description: "arb".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(1), NearToken::from_yoctonear(0), 12);
        c.raise_dispute(id, "x".into());
        ctx(accounts(2), NearToken::from_yoctonear(0), 13);
        let _ = c.resolve_dispute(id, U128(70), U128(20));
    }

    #[test]
    fn resolve_full_refund_and_split() {
        // full refund
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        register_storage(&mut c, accounts(1).clone());
        register_storage(&mut c, accounts(2).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Arbitrated,
            seller: accounts(1),
            arbitrator: Some(accounts(2)),
            total_amount: U128(100),
            description: "arb".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(1), NearToken::from_yoctonear(0), 12);
        c.raise_dispute(id, "x".into());
        ctx(accounts(2), NearToken::from_yoctonear(0), 13);
        let _ = c.resolve_dispute(id, U128(0), U128(100));
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.status, EscrowStatus::Resolved);
        assert_eq!(e.released_amount.0, 0);
        assert_eq!(e.refunded_amount.0, 100);
    }

    #[test]
    #[should_panic(expected = "escrow not disputed")]
    fn double_resolve_blocked() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        register_storage(&mut c, accounts(1).clone());
        register_storage(&mut c, accounts(2).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Arbitrated,
            seller: accounts(1),
            arbitrator: Some(accounts(2)),
            total_amount: U128(100),
            description: "arb".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(1), NearToken::from_yoctonear(0), 12);
        c.raise_dispute(id, "x".into());
        ctx(accounts(2), NearToken::from_yoctonear(0), 13);
        let _ = c.resolve_dispute(id, U128(60), U128(40));
        ctx(accounts(2), NearToken::from_yoctonear(0), 14);
        let _ = c.resolve_dispute(id, U128(0), U128(0));
    }

    #[test]
    #[should_panic(expected = "cannot release in current state")]
    fn release_while_disputed_blocked() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        register_storage(&mut c, accounts(1).clone());
        register_storage(&mut c, accounts(2).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Arbitrated,
            seller: accounts(1),
            arbitrator: Some(accounts(2)),
            total_amount: U128(100),
            description: "arb".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(1), NearToken::from_yoctonear(0), 12);
        c.raise_dispute(id, "x".into());
        ctx(accounts(0), NearToken::from_yoctonear(0), 13);
        let _ = c.release(id, None);
    }

    #[test]
    #[should_panic(expected = "only created escrow can be cancelled")]
    fn cancel_while_disputed_blocked() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        register_storage(&mut c, accounts(1).clone());
        register_storage(&mut c, accounts(2).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Arbitrated,
            seller: accounts(1),
            arbitrator: Some(accounts(2)),
            total_amount: U128(100),
            description: "arb".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(1), NearToken::from_yoctonear(0), 12);
        c.raise_dispute(id, "x".into());
        ctx(accounts(0), NearToken::from_yoctonear(0), 13);
        c.cancel(id);
    }

    #[test]
    fn release_failure_callback_restores_liability() {
        let mut c = EscrowContract::new();
        let id = create_freelance_funded(&mut c, accounts(0), accounts(1), 100, 10);
        ctx(accounts(0), NearToken::from_yoctonear(0), 11);
        // release transfers earmarked funds; in unit tests the callback runs inline with Ok
        let _ = c.release(id, None);
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.status, EscrowStatus::Released);
        assert_eq!(e.released_amount.0, 100);
        // simulate a failed transfer: the liability must be restored
        let ok = c.on_release(id, 100, Err(PromiseError::Failed));
        assert!(!ok);
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.released_amount.0, 0);
        assert_eq!(e.status, EscrowStatus::InProgress);
        // invariant restored
        assert_eq!(
            e.funded_amount.0,
            e.released_amount.0 + e.refunded_amount.0 + 100
        );
    }

    #[test]
    fn release_failure_callback_partial() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Milestone,
            seller: accounts(1),
            arbitrator: None,
            total_amount: U128(300),
            description: "m".into(),
            milestones: Some(vec![
                MilestoneInput {
                    title: "a".into(),
                    amount: U128(100),
                },
                MilestoneInput {
                    title: "b".into(),
                    amount: U128(200),
                },
            ]),
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(300), 11);
        c.fund_escrow(id);
        ctx(accounts(0), NearToken::from_yoctonear(0), 12);
        c.approve_milestone(id, 0);
        let _ = c.release(id, Some(0));
        let ok = c.on_release(id, 100, Err(PromiseError::Failed));
        assert!(!ok);
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.released_amount.0, 0);
        assert_eq!(e.status, EscrowStatus::InProgress);
    }

    #[test]
    fn refund_failure_callback_restores_liability() {
        let mut c = EscrowContract::new();
        let id = create_freelance_funded(&mut c, accounts(0), accounts(1), 100, 10);
        // advance to a fresh context as buyer, refund sets liability then we fail the callback
        ctx(accounts(0), NearToken::from_yoctonear(0), 20);
        let _p = c.refund(id);
        // refund executes the transfer inline in unit tests; simulate failure on the recorded state:
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.refunded_amount.0, 100);
        assert_eq!(e.status, EscrowStatus::Refunded);
        let ok = c.on_refund(id, 100, e.status, Err(PromiseError::Failed));
        assert!(!ok);
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.refunded_amount.0, 0);
        assert_eq!(e.status, EscrowStatus::Refunded);
        assert_eq!(
            e.funded_amount.0,
            e.released_amount.0 + e.refunded_amount.0 + 100
        );
    }

    #[test]
    fn resolve_failure_callback_restores_to_disputed() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        register_storage(&mut c, accounts(1).clone());
        register_storage(&mut c, accounts(2).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let input = CreateEscrowInput {
            kind: EscrowKind::Arbitrated,
            seller: accounts(1),
            arbitrator: Some(accounts(2)),
            total_amount: U128(100),
            description: "arb".into(),
            milestones: None,
            funding_deadline_ns: None,
            release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(1), NearToken::from_yoctonear(0), 12);
        c.raise_dispute(id, "x".into());
        ctx(accounts(2), NearToken::from_yoctonear(0), 13);
        // resolve sets liability then simulate both callbacks failing
        let _ = c.resolve_dispute(id, U128(60), U128(40));
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.status, EscrowStatus::Resolved);
        assert_eq!(e.released_amount.0, 60);
        assert_eq!(e.refunded_amount.0, 40);

        let ok = c.on_release(id, 60, Err(PromiseError::Failed));
        assert!(!ok);
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.released_amount.0, 0);
        assert_eq!(e.status, EscrowStatus::Disputed);
        let ok = c.on_refund(id, 40, EscrowStatus::Disputed, Err(PromiseError::Failed));
        assert!(!ok);
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.refunded_amount.0, 0);
        assert_eq!(e.status, EscrowStatus::Disputed);
        assert_eq!(
            e.funded_amount.0,
            e.released_amount.0 + e.refunded_amount.0 + 100
        );
    }

    #[test]
    fn account_escrows_history_pagination() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let before = c.get_escrows_by_account(accounts(0), 0, 1000).len();
        let id1 = c.create_escrow(freelance_input(accounts(1), 100));
        let _id2 = c.create_escrow(freelance_input(accounts(1), 200));
        ctx(accounts(1), NearToken::from_yoctonear(0), 20);
        register_storage(&mut c, accounts(1).clone());
        let _id3 = c.create_escrow(freelance_input(accounts(0), 300));

        let after = c.get_escrows_by_account(accounts(0), 0, 1000).len();
        assert_eq!(after, before + 3);

        let page = c.get_escrows_by_account(accounts(0), 0, 1);
        assert_eq!(page.len(), 1);
        let page2 = c.get_escrows_by_account(accounts(0), 1, 1);
        assert_eq!(page2.len(), 1);
        assert_ne!(page2[0].id, page[0].id);

        // over-limit request is capped
        let big = c.get_escrows_by_account(accounts(0), 0, 1000);
        assert!(big.len() <= MAX_PAGE_LIMIT as usize);

        // history is queryable per escrow
        let hist = c.get_history(id1);
        assert!(!hist.is_empty());
        assert_eq!(hist[0].action, "created");
    }

    #[test]
    fn list_escrows_pagination() {
        let mut c = EscrowContract::new();
        register_storage(&mut c, accounts(0).clone());
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let before = c.list_escrows(0, 1000).len();
        c.create_escrow(freelance_input(accounts(1), 100));
        ctx(accounts(0), NearToken::from_yoctonear(0), 11);
        c.create_escrow(freelance_input(accounts(1), 200));
        let all = c.list_escrows(0, 1000);
        assert_eq!(all.len(), before + 2);
        let page = c.list_escrows(1, 1);
        assert_eq!(page.len(), 1);
        assert_ne!(page[0].id, all[0].id);
    }

    #[test]
    #[should_panic(expected = "escrow not found")]
    fn missing_escrow_operations_panic() {
        let c = EscrowContract::new();
        c.expect_escrow(9999);
    }
}

// `Escrow` test-only helper: remaining liability not part of the public ABI.
#[cfg(test)]
impl Escrow {
    fn available_balance_if_public(&self) -> u128 {
        self.funded_amount.0 - self.released_amount.0 - self.refunded_amount.0
    }
}
