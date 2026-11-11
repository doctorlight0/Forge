//! NEAR Forge Escrow Engine
//!
//! Reusable native NEAR escrow contract supporting four workflow modes:
//! - Freelance (single release)
//! - Milestone (multi-step releases)
//! - TimeLocked (release/refund gated by deadlines)
//! - Arbitrated (dispute resolution by designated arbitrator)

use borsh::{BorshDeserialize, BorshSerialize};
use near_sdk::collections::UnorderedMap;
use near_sdk::json_types::{U128, U64};
use near_sdk::serde::{Deserialize, Serialize};
use near_sdk::{
    env, near, require, AccountId, BorshStorageKey, NearToken, PanicOnDefault, Promise,
    PromiseError, PromiseOrValue,
};

pub type EscrowId = u64;
pub type MilestoneId = u32;

#[derive(BorshSerialize, BorshStorageKey)]
enum StorageKey {
    Escrows,
    Milestones { escrow_id: EscrowId },
    History { escrow_id: EscrowId },
    FundedMarkers { escrow_id: EscrowId },
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

#[near(contract_state)]
#[derive(PanicOnDefault)]
pub struct EscrowContract {
    escrows: UnorderedMap<EscrowId, Escrow>,
    milestones: UnorderedMap<EscrowId, Vec<Milestone>>,
    history: UnorderedMap<EscrowId, Vec<HistoryEvent>>,
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
            next_id: 1,
        }
    }

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
        let keys: Vec<EscrowId> = self.escrows.keys().collect();
        keys.into_iter()
            .skip(from_index as usize)
            .take(limit as usize)
            .filter_map(|id| self.escrows.get(&id))
            .collect()
    }

    pub fn next_escrow_id(&self) -> EscrowId {
        self.next_id
    }

    pub fn create_escrow(&mut self, input: CreateEscrowInput) -> EscrowId {
        let buyer = env::predecessor_account_id();
        require!(buyer != input.seller, "buyer and seller must differ");
        require!(input.total_amount.0 > 0, "total_amount must be > 0");
        if let Some(a) = &input.arbitrator {
            require!(a != &buyer && a != &input.seller, "arbitrator must be distinct");
        }
        match input.kind {
            EscrowKind::Arbitrated => require!(input.arbitrator.is_some(), "arbitrator required"),
            EscrowKind::TimeLocked => require!(
                input.release_deadline_ns.is_some() || input.funding_deadline_ns.is_some(),
                "time-locked escrow requires a deadline"
            ),
            _ => {}
        }

        let id = self.next_id;
        self.next_id = self.next_id.checked_add(1).expect("id overflow");

        let mut milestone_count = 0u32;
        let mut ms: Vec<Milestone> = Vec::new();
        if matches!(input.kind, EscrowKind::Milestone) {
            let items = input.milestones.clone().unwrap_or_default();
            require!(!items.is_empty(), "milestone escrow requires milestones");
            let mut sum: u128 = 0;
            for (i, m) in items.iter().enumerate() {
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
            require!(sum == input.total_amount.0, "milestone amounts must equal total");
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
            seller: input.seller,
            arbitrator: input.arbitrator,
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
        self.escrows.insert(&id, &escrow);
        self.push_history(id, buyer, "created", None);
        id
    }

    #[payable]
    pub fn fund_escrow(&mut self, escrow_id: EscrowId) {
        let mut e = self.expect_escrow(escrow_id);
        require!(env::predecessor_account_id() == e.buyer, "only buyer can fund");
        require!(matches!(e.status, EscrowStatus::Created), "escrow not fundable in current state");
        if let Some(dl) = e.funding_deadline_ns {
            require!(env::block_timestamp() <= dl.0, "funding deadline passed");
        }
        let attached = env::attached_deposit();
        require!(attached.as_yoctonear() == e.total_amount.0, "must attach exact total_amount");
        require!(e.funded_amount.0 == 0, "already funded");
        e.funded_amount = e.total_amount;
        e.status = EscrowStatus::Funded;
        let actor = e.buyer.clone();
        self.escrows.insert(&escrow_id, &e);
        self.push_history(escrow_id, actor, "funded", Some(e.total_amount.0.to_string()));
    }

    pub fn approve_work(&mut self, escrow_id: EscrowId) {
        let mut e = self.expect_escrow(escrow_id);
        require!(env::predecessor_account_id() == e.buyer, "only buyer");
        require!(matches!(e.status, EscrowStatus::Funded | EscrowStatus::InProgress), "cannot approve in current state");
        require!(!matches!(e.kind, EscrowKind::Milestone), "use approve_milestone for milestone escrows");
        e.status = EscrowStatus::InProgress;
        let actor = e.buyer.clone();
        self.escrows.insert(&escrow_id, &e);
        self.push_history(escrow_id, actor, "approved", None);
    }

    pub fn approve_milestone(&mut self, escrow_id: EscrowId, milestone_id: MilestoneId) {
        let mut e = self.expect_escrow(escrow_id);
        require!(env::predecessor_account_id() == e.buyer, "only buyer");
        require!(matches!(e.kind, EscrowKind::Milestone), "not a milestone escrow");
        require!(matches!(e.status, EscrowStatus::Funded | EscrowStatus::InProgress | EscrowStatus::PartiallyReleased), "cannot approve milestone in current state");
        let mut ms = self.milestones.get(&escrow_id).expect("milestones missing");
        let m = ms.get_mut(milestone_id as usize).expect("invalid milestone");
        require!(!m.released, "milestone already released");
        require!(!m.approved, "milestone already approved");
        m.approved = true;
        self.milestones.insert(&escrow_id, &ms);
        if matches!(e.status, EscrowStatus::Funded) { e.status = EscrowStatus::InProgress; }
        let actor = e.buyer.clone();
        self.escrows.insert(&escrow_id, &e);
        self.push_history(escrow_id, actor, "milestone_approved", Some(milestone_id.to_string()));
    }

    pub fn release(&mut self, escrow_id: EscrowId, milestone_id: Option<MilestoneId>) -> PromiseOrValue<()> {
        let mut e = self.expect_escrow(escrow_id);
        require!(env::predecessor_account_id() == e.buyer, "only buyer");
        require!(matches!(e.status, EscrowStatus::Funded | EscrowStatus::InProgress | EscrowStatus::PartiallyReleased), "cannot release in current state");
        if matches!(e.kind, EscrowKind::TimeLocked) {
            if let Some(dl) = e.release_deadline_ns {
                require!(env::block_timestamp() >= dl.0, "release deadline not reached");
            }
        }

        let (amount, label) = match e.kind {
            EscrowKind::Milestone => {
                let mid = milestone_id.expect("milestone_id required");
                let mut ms = self.milestones.get(&escrow_id).expect("milestones missing");
                let m = ms.get_mut(mid as usize).expect("invalid milestone");
                require!(m.approved, "milestone not approved");
                require!(!m.released, "duplicate release: milestone already released");
                m.released = true;
                let amt = m.amount.0;
                self.milestones.insert(&escrow_id, &ms);
                (amt, format!("milestone:{mid}"))
            }
            _ => {
                require!(milestone_id.is_none(), "milestone_id only for milestone escrows");
                require!(e.released_amount.0 == 0, "duplicate release");
                let remaining = e.funded_amount.0.checked_sub(e.released_amount.0).and_then(|v| v.checked_sub(e.refunded_amount.0)).expect("accounting underflow");
                require!(remaining > 0, "nothing to release");
                (remaining, "full".to_string())
            }
        };

        self.apply_release(&mut e, amount);
        let seller = e.seller.clone();
        self.escrows.insert(&escrow_id, &e);
        self.push_history(escrow_id, env::predecessor_account_id(), "release_requested", Some(label));
        PromiseOrValue::Promise(Promise::new(seller).transfer(NearToken::from_yoctonear(amount)).then(Self::ext(env::current_account_id()).on_release(escrow_id, amount)))
    }

    pub fn cancel(&mut self, escrow_id: EscrowId) {
        let mut e = self.expect_escrow(escrow_id);
        require!(env::predecessor_account_id() == e.buyer, "only buyer");
        require!(matches!(e.status, EscrowStatus::Created), "only unfunded escrow can be cancelled");
        require!(e.funded_amount.0 == 0, "funded escrow cannot be cancelled");
        e.status = EscrowStatus::Cancelled;
        let actor = e.buyer.clone();
        self.escrows.insert(&escrow_id, &e);
        self.push_history(escrow_id, actor, "cancelled", None);
    }

    pub fn refund(&mut self, escrow_id: EscrowId) -> PromiseOrValue<()> {
        let mut e = self.expect_escrow(escrow_id);
        let caller = env::predecessor_account_id();
        let is_buyer = caller == e.buyer;
        let is_seller = caller == e.seller;
        let is_arb = e.arbitrator.as_ref() == Some(&caller);
        require!(is_buyer || is_seller || is_arb, "not authorized");
        require!(matches!(e.status, EscrowStatus::Funded | EscrowStatus::InProgress | EscrowStatus::Disputed), "cannot refund in current state");
        require!(e.released_amount.0 == 0, "cannot refund after any release (use dispute/resolution)");
        if matches!(e.kind, EscrowKind::TimeLocked) {
            if let Some(dl) = e.release_deadline_ns {
                if env::block_timestamp() <= dl.0 && !is_arb {
                    // before deadline allow participant-initiated refund path (simple policy)
                }
            }
        } else if !is_arb {
            require!(is_buyer, "only buyer or arbitrator can refund");
        }
        let amount = e.funded_amount.0.checked_sub(e.refunded_amount.0).expect("accounting underflow");
        require!(amount > 0, "nothing to refund");
        require!(e.refunded_amount.0 == 0, "duplicate refund");
        e.refunded_amount = U128(amount);
        e.status = EscrowStatus::Refunded;
        let buyer = e.buyer.clone();
        self.escrows.insert(&escrow_id, &e);
        self.push_history(escrow_id, caller, "refund_requested", Some(amount.to_string()));
        PromiseOrValue::Promise(Promise::new(buyer).transfer(NearToken::from_yoctonear(amount)).then(Self::ext(env::current_account_id()).on_refund(escrow_id, amount)))
    }

    pub fn raise_dispute(&mut self, escrow_id: EscrowId, reason: String) {
        let mut e = self.expect_escrow(escrow_id);
        let caller = env::predecessor_account_id();
        require!(caller == e.buyer || caller == e.seller, "only participants can dispute");
        require!(e.arbitrator.is_some(), "no arbitrator configured");
        require!(matches!(e.status, EscrowStatus::Funded | EscrowStatus::InProgress | EscrowStatus::PartiallyReleased), "cannot dispute in current state");
        e.status = EscrowStatus::Disputed;
        e.dispute_reason = Some(reason);
        self.escrows.insert(&escrow_id, &e);
        self.push_history(escrow_id, caller, "disputed", e.dispute_reason.clone());
    }

    pub fn resolve_dispute(&mut self, escrow_id: EscrowId, release_to_seller: U128, refund_to_buyer: U128) -> PromiseOrValue<()> {
        let mut e = self.expect_escrow(escrow_id);
        let caller = env::predecessor_account_id();
        require!(e.arbitrator.as_ref() == Some(&caller), "only arbitrator");
        require!(matches!(e.status, EscrowStatus::Disputed), "escrow not disputed");
        let available = e.funded_amount.0.checked_sub(e.released_amount.0).and_then(|v| v.checked_sub(e.refunded_amount.0)).expect("accounting underflow");
        let total = release_to_seller.0.checked_add(refund_to_buyer.0).expect("overflow");
        require!(total == available, "resolution amounts must equal available balance");

        e.released_amount = U128(e.released_amount.0.checked_add(release_to_seller.0).unwrap());
        e.refunded_amount = U128(e.refunded_amount.0.checked_add(refund_to_buyer.0).unwrap());
        e.status = EscrowStatus::Resolved;
        let seller = e.seller.clone();
        let buyer = e.buyer.clone();
        self.escrows.insert(&escrow_id, &e);
        self.push_history(escrow_id, caller, "resolved", Some(format!("seller:{},buyer:{}", release_to_seller.0, refund_to_buyer.0)));

        if release_to_seller.0 > 0 && refund_to_buyer.0 > 0 {
            let p = Promise::new(seller).transfer(NearToken::from_yoctonear(release_to_seller.0))
                .then(Self::ext(env::current_account_id()).on_release(escrow_id, release_to_seller.0));
            let p2 = Promise::new(buyer).transfer(NearToken::from_yoctonear(refund_to_buyer.0))
                .then(Self::ext(env::current_account_id()).on_refund(escrow_id, refund_to_buyer.0));
            PromiseOrValue::Promise(p.and(p2))
        } else if release_to_seller.0 > 0 {
            PromiseOrValue::Promise(Promise::new(seller).transfer(NearToken::from_yoctonear(release_to_seller.0)).then(Self::ext(env::current_account_id()).on_release(escrow_id, release_to_seller.0)))
        } else {
            PromiseOrValue::Promise(Promise::new(buyer).transfer(NearToken::from_yoctonear(refund_to_buyer.0)).then(Self::ext(env::current_account_id()).on_refund(escrow_id, refund_to_buyer.0)))
        }
    }

    #[private]
    pub fn on_release(&mut self, escrow_id: EscrowId, amount: u128, #[callback_result] result: Result<(), PromiseError>) -> bool {
        if result.is_err() {
            if let Some(mut e) = self.escrows.get(&escrow_id) {
                e.released_amount = U128(e.released_amount.0.saturating_sub(amount));
                if e.released_amount.0 == 0 && matches!(e.status, EscrowStatus::Released | EscrowStatus::PartiallyReleased) {
                    e.status = EscrowStatus::InProgress;
                } else if e.released_amount.0 > 0 {
                    e.status = EscrowStatus::PartiallyReleased;
                }
                self.escrows.insert(&escrow_id, &e);
                self.push_history(escrow_id, env::current_account_id(), "release_failed_recovered", Some(amount.to_string()));
            }
            return false;
        }
        self.push_history(escrow_id, env::current_account_id(), "released", Some(amount.to_string()));
        true
    }

    #[private]
    pub fn on_refund(&mut self, escrow_id: EscrowId, amount: u128, #[callback_result] result: Result<(), PromiseError>) -> bool {
        if result.is_err() {
            if let Some(mut e) = self.escrows.get(&escrow_id) {
                e.refunded_amount = U128(e.refunded_amount.0.saturating_sub(amount));
                if e.refunded_amount.0 == 0 { e.status = EscrowStatus::InProgress; }
                self.escrows.insert(&escrow_id, &e);
                self.push_history(escrow_id, env::current_account_id(), "refund_failed_recovered", Some(amount.to_string()));
            }
            return false;
        }
        self.push_history(escrow_id, env::current_account_id(), "refunded", Some(amount.to_string()));
        true
    }

    fn expect_escrow(&self, escrow_id: EscrowId) -> Escrow {
        self.escrows.get(&escrow_id).expect("escrow not found")
    }

    fn push_history(&mut self, escrow_id: EscrowId, actor: AccountId, action: &str, note: Option<String>) {
        let mut h = self.history.get(&escrow_id).unwrap_or_default();
        h.push(HistoryEvent { ts_ns: U64(env::block_timestamp()), actor, action: action.to_string(), note });
        self.history.insert(&escrow_id, &h);
    }

    fn apply_release(&self, e: &mut Escrow, amount: u128) {
        let available = e.funded_amount.0.checked_sub(e.released_amount.0).and_then(|v| v.checked_sub(e.refunded_amount.0)).expect("accounting underflow");
        require!(amount > 0 && amount <= available, "invalid release amount");
        e.released_amount = U128(e.released_amount.0.checked_add(amount).expect("overflow"));
        let remaining = e.funded_amount.0.checked_sub(e.released_amount.0).and_then(|v| v.checked_sub(e.refunded_amount.0)).unwrap();
        if remaining == 0 { e.status = EscrowStatus::Released; }
        else if matches!(e.kind, EscrowKind::Milestone) { e.status = EscrowStatus::PartiallyReleased; }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use near_sdk::test_utils::{accounts, VMContextBuilder};
    use near_sdk::testing_env;

    fn ctx(predecessor: AccountId, attached: NearToken, ts: u64) {
        let mut builder = VMContextBuilder::new();
        builder.predecessor_account_id(predecessor.clone());
        builder.signer_account_id(predecessor);
        builder.attached_deposit(attached);
        builder.block_timestamp(ts);
        testing_env!(builder.build());
    }

    fn freelance_input(seller: AccountId, amount: u128) -> CreateEscrowInput {
        CreateEscrowInput {
            kind: EscrowKind::Freelance, seller, arbitrator: None, total_amount: U128(amount),
            description: "job".into(), milestones: None, funding_deadline_ns: None, release_deadline_ns: None,
        }
    }

    #[test]
    fn create_and_fund_freelance() {
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let mut c = EscrowContract::new();
        let id = c.create_escrow(freelance_input(accounts(1), 100));
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.status, EscrowStatus::Funded);
        assert_eq!(e.funded_amount.0, 100);
    }

    #[test]
    #[should_panic(expected = "buyer and seller must differ")]
    fn rejects_same_buyer_seller() {
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let mut c = EscrowContract::new();
        c.create_escrow(freelance_input(accounts(0), 100));
    }

    #[test]
    #[should_panic(expected = "must attach exact total_amount")]
    fn wrong_deposit_rejected() {
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let mut c = EscrowContract::new();
        let id = c.create_escrow(freelance_input(accounts(1), 100));
        ctx(accounts(0), NearToken::from_yoctonear(50), 11);
        c.fund_escrow(id);
    }

    #[test]
    fn milestone_approve_and_release_flow() {
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let mut c = EscrowContract::new();
        let input = CreateEscrowInput {
            kind: EscrowKind::Milestone, seller: accounts(1), arbitrator: None, total_amount: U128(300), description: "m".into(),
            milestones: Some(vec![MilestoneInput { title: "a".into(), amount: U128(100) }, MilestoneInput { title: "b".into(), amount: U128(200) }]),
            funding_deadline_ns: None, release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(300), 11);
        c.fund_escrow(id);
        ctx(accounts(0), NearToken::from_yoctonear(0), 12);
        c.approve_milestone(id, 0);
        let ms = c.get_milestones(id);
        assert!(ms[0].approved);
        c.release(id, Some(0));
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.released_amount.0, 100);
        assert_eq!(e.status, EscrowStatus::PartiallyReleased);
    }

    #[test]
    #[should_panic(expected = "duplicate release: milestone already released")]
    fn duplicate_milestone_release_blocked() {
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let mut c = EscrowContract::new();
        let input = CreateEscrowInput {
            kind: EscrowKind::Milestone, seller: accounts(1), arbitrator: None, total_amount: U128(200), description: "m".into(),
            milestones: Some(vec![
                MilestoneInput { title: "a".into(), amount: U128(100) },
                MilestoneInput { title: "b".into(), amount: U128(100) },
            ]),
            funding_deadline_ns: None, release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(200), 11);
        c.fund_escrow(id);
        ctx(accounts(0), NearToken::from_yoctonear(0), 12);
        c.approve_milestone(id, 0);
        let _ = c.release(id, Some(0));
        let _ = c.release(id, Some(0));
    }

    #[test]
    #[should_panic(expected = "release deadline not reached")]
    fn time_locked_release_before_deadline_panics() {
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let mut c = EscrowContract::new();
        let input = CreateEscrowInput {
            kind: EscrowKind::TimeLocked, seller: accounts(1), arbitrator: None, total_amount: U128(100), description: "tl".into(),
            milestones: None, funding_deadline_ns: None, release_deadline_ns: Some(U64(1000)),
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(0), NearToken::from_yoctonear(0), 500);
        c.approve_work(id);
        c.release(id, None);
    }

    #[test]
    fn arbitrated_dispute_and_resolve_state() {
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let mut c = EscrowContract::new();
        let input = CreateEscrowInput {
            kind: EscrowKind::Arbitrated, seller: accounts(1), arbitrator: Some(accounts(2)), total_amount: U128(100), description: "arb".into(),
            milestones: None, funding_deadline_ns: None, release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(1), NearToken::from_yoctonear(0), 12);
        c.raise_dispute(id, "issue".into());
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.status, EscrowStatus::Disputed);
        ctx(accounts(2), NearToken::from_yoctonear(0), 13);
        let _ = c.resolve_dispute(id, U128(60), U128(40));
        let e = c.get_escrow(id).unwrap();
        assert_eq!(e.status, EscrowStatus::Resolved);
        assert_eq!(e.released_amount.0, 60);
        assert_eq!(e.refunded_amount.0, 40);
    }

    #[test]
    #[should_panic(expected = "only arbitrator")]
    fn non_arbitrator_cannot_resolve() {
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let mut c = EscrowContract::new();
        let input = CreateEscrowInput {
            kind: EscrowKind::Arbitrated, seller: accounts(1), arbitrator: Some(accounts(2)), total_amount: U128(100), description: "arb".into(),
            milestones: None, funding_deadline_ns: None, release_deadline_ns: None,
        };
        let id = c.create_escrow(input);
        ctx(accounts(0), NearToken::from_yoctonear(100), 11);
        c.fund_escrow(id);
        ctx(accounts(0), NearToken::from_yoctonear(0), 12);
        c.raise_dispute(id, "x".into());
        ctx(accounts(0), NearToken::from_yoctonear(0), 13);
        let _ = c.resolve_dispute(id, U128(100), U128(0));
    }

    #[test]
    fn cancel_unfunded() {
        ctx(accounts(0), NearToken::from_yoctonear(0), 10);
        let mut c = EscrowContract::new();
        let id = c.create_escrow(freelance_input(accounts(1), 100));
        c.cancel(id);
        assert_eq!(c.get_escrow(id).unwrap().status, EscrowStatus::Cancelled);
    }
}
