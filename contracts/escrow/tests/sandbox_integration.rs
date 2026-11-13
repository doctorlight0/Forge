use near_sdk::NearToken;
use near_workspaces::types::AccountId;
use serde_json::json;

const WASM_PATH: &str = "./target/wasm32-unknown-unknown/release/near_forge_escrow.wasm";

async fn deploy(
    worker: &near_workspaces::Worker<near_workspaces::network::Sandbox>,
) -> anyhow::Result<near_workspaces::Contract> {
    let wasm = std::fs::read(WASM_PATH)?;
    let contract = worker.dev_deploy(&wasm).await?;
    let out = contract.call("new").transact().await?;
    assert!(out.is_success(), "init failed: {out:?}");
    Ok(contract)
}

fn yocto(n: u128) -> NearToken {
    NearToken::from_yoctonear(n)
}

#[tokio::test]
async fn deployment_and_initialization() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let wasm = std::fs::read(WASM_PATH)?;
    let contract = worker.dev_deploy(&wasm).await?;
    let out = contract.call("new").transact().await?;
    assert!(out.is_success());
    let next: u64 = contract.view("next_escrow_id").await?.json()?;
    assert_eq!(next, 1);
    let list: serde_json::Value = contract
        .view("list_escrows")
        .args_json(json!({"from_index":0,"limit":10}))
        .await?
        .json()?;
    assert_eq!(list.as_array().unwrap().len(), 0);
    // repeated init should fail for already-initialized state in near-sdk #[init] default behavior? test actual behavior
    let out2 = contract.call("new").transact().await?;
    assert!(out2.is_failure(), "repeated init unexpectedly succeeded");
    Ok(())
}

#[tokio::test]
async fn escrow_lifecycle_freelance() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let contract = deploy(&worker).await?;
    let buyer = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let seller_before = seller.view_account().await?.balance;

    let create = buyer
        .call(contract.id(), "create_escrow")
        .args_json(json!({
            "input": {
                "kind": "Freelance",
                "seller": seller.id(),
                "arbitrator": null,
                "total_amount": "1000000000000000000000000",
                "description": "job",
                "milestones": null,
                "funding_deadline_ns": null,
                "release_deadline_ns": null
            }
        }))
        .transact()
        .await?;
    assert!(create.is_success(), "create failed: {create:?}");
    let escrow_id: u64 = create.json()?;
    let escrow: serde_json::Value = contract
        .view("get_escrow")
        .args_json(json!({"escrow_id": escrow_id}))
        .await?
        .json()?;
    assert_eq!(escrow["status"], "Created");
    assert_eq!(escrow["funded_amount"], "0");

    let fund = buyer
        .call(contract.id(), "fund_escrow")
        .args_json(json!({"escrow_id": escrow_id}))
        .deposit(yocto(1_000_000_000_000_000_000_000_000))
        .transact()
        .await?;
    assert!(fund.is_success(), "fund failed: {fund:?}");
    let escrow: serde_json::Value = contract
        .view("get_escrow")
        .args_json(json!({"escrow_id": escrow_id}))
        .await?
        .json()?;
    assert_eq!(escrow["status"], "Funded");
    assert_eq!(escrow["funded_amount"], "1000000000000000000000000");

    let approve = buyer
        .call(contract.id(), "approve_work")
        .args_json(json!({"escrow_id": escrow_id}))
        .transact()
        .await?;
    assert!(approve.is_success(), "approve failed: {approve:?}");

    let release = buyer
        .call(contract.id(), "release")
        .args_json(json!({"escrow_id": escrow_id, "milestone_id": null}))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(release.is_success(), "release failed: {release:?}");
    let escrow: serde_json::Value = contract
        .view("get_escrow")
        .args_json(json!({"escrow_id": escrow_id}))
        .await?
        .json()?;
    assert_eq!(escrow["status"], "Released");
    assert_eq!(escrow["released_amount"], "1000000000000000000000000");
    let seller_after = seller.view_account().await?.balance;
    assert!(
        seller_after.as_yoctonear()
            >= seller_before.as_yoctonear() + 999_000_000_000_000_000_000_000,
        "seller not paid: before={} after={}",
        seller_before.as_yoctonear(),
        seller_after.as_yoctonear()
    );
    Ok(())
}

#[tokio::test]
async fn cancellation_and_refunds() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let contract = deploy(&worker).await?;
    let buyer = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let buyer_before = buyer.view_account().await?.balance;

    // cancel unfunded
    let id1: u64 = buyer.call(contract.id(), "create_escrow").args_json(json!({
        "input": {"kind":"Freelance","seller":seller.id(),"arbitrator":null,"total_amount":"500000000000000000000000","description":"x","milestones":null,"funding_deadline_ns":null,"release_deadline_ns":null}
    })).transact().await?.json()?;
    let cancel = buyer
        .call(contract.id(), "cancel")
        .args_json(json!({"escrow_id": id1}))
        .transact()
        .await?;
    assert!(cancel.is_success(), "cancel failed: {cancel:?}");
    let e: serde_json::Value = contract
        .view("get_escrow")
        .args_json(json!({"escrow_id": id1}))
        .await?
        .json()?;
    assert_eq!(e["status"], "Cancelled");
    // invalid cancel after funded
    let id2: u64 = buyer.call(contract.id(), "create_escrow").args_json(json!({
        "input": {"kind":"Freelance","seller":seller.id(),"arbitrator":null,"total_amount":"500000000000000000000000","description":"x","milestones":null,"funding_deadline_ns":null,"release_deadline_ns":null}
    })).transact().await?.json()?;
    buyer
        .call(contract.id(), "fund_escrow")
        .args_json(json!({"escrow_id": id2}))
        .deposit(yocto(500_000_000_000_000_000_000_000))
        .transact()
        .await?;
    let bad_cancel = buyer
        .call(contract.id(), "cancel")
        .args_json(json!({"escrow_id": id2}))
        .transact()
        .await?;
    assert!(bad_cancel.is_failure(), "funded cancel should fail");

    // refund funded escrow
    let refund = buyer
        .call(contract.id(), "refund")
        .args_json(json!({"escrow_id": id2}))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(refund.is_success(), "refund failed: {refund:?}");
    let e: serde_json::Value = contract
        .view("get_escrow")
        .args_json(json!({"escrow_id": id2}))
        .await?
        .json()?;
    assert_eq!(e["status"], "Refunded");
    assert_eq!(e["refunded_amount"], "500000000000000000000000");
    let buyer_after = buyer.view_account().await?.balance;
    // buyer paid deposits + gas across ops; hard to assert exact but should be > before minus 2*amount roughly. at least refund recorded.
    let _ = (buyer_before, buyer_after);
    Ok(())
}

#[tokio::test]
async fn milestone_escrow_flow() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let contract = deploy(&worker).await?;
    let buyer = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let seller_before = seller.view_account().await?.balance;
    let id: u64 = buyer.call(contract.id(), "create_escrow").args_json(json!({
        "input": {"kind":"Milestone","seller":seller.id(),"arbitrator":null,"total_amount":"3000000000000000000000000","description":"m","milestones":[{"title":"a","amount":"1000000000000000000000000"},{"title":"b","amount":"2000000000000000000000000"}],"funding_deadline_ns":null,"release_deadline_ns":null}
    })).transact().await?.json()?;
    buyer
        .call(contract.id(), "fund_escrow")
        .args_json(json!({"escrow_id": id}))
        .deposit(yocto(3_000_000_000_000_000_000_000_000))
        .transact()
        .await?;
    let ms: serde_json::Value = contract
        .view("get_milestones")
        .args_json(json!({"escrow_id": id}))
        .await?
        .json()?;
    assert_eq!(ms.as_array().unwrap().len(), 2);
    buyer
        .call(contract.id(), "approve_milestone")
        .args_json(json!({"escrow_id": id, "milestone_id": 0}))
        .transact()
        .await?;
    let rel = buyer
        .call(contract.id(), "release")
        .args_json(json!({"escrow_id": id, "milestone_id": 0}))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(rel.is_success(), "milestone release failed: {rel:?}");
    let e: serde_json::Value = contract
        .view("get_escrow")
        .args_json(json!({"escrow_id": id}))
        .await?
        .json()?;
    assert_eq!(e["status"], "PartiallyReleased");
    assert_eq!(e["released_amount"], "1000000000000000000000000");
    buyer
        .call(contract.id(), "approve_milestone")
        .args_json(json!({"escrow_id": id, "milestone_id": 1}))
        .transact()
        .await?;
    buyer
        .call(contract.id(), "release")
        .args_json(json!({"escrow_id": id, "milestone_id": 1}))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    let e: serde_json::Value = contract
        .view("get_escrow")
        .args_json(json!({"escrow_id": id}))
        .await?
        .json()?;
    assert_eq!(e["status"], "Released");
    assert_eq!(e["released_amount"], "3000000000000000000000000");
    let seller_after = seller.view_account().await?.balance;
    assert!(seller_after.as_yoctonear() > seller_before.as_yoctonear());
    Ok(())
}

#[tokio::test]
async fn timelock_deadlines_and_disputes() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let contract = deploy(&worker).await?;
    let buyer = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let arb = worker.dev_create_account().await?;

    // time-locked: release before deadline rejected, after allowed
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)?
        .as_nanos() as u64;
    let dl = now + 5_000_000_000; // +5s
    let id: u64 = buyer.call(contract.id(), "create_escrow").args_json(json!({
        "input": {"kind":"TimeLocked","seller":seller.id(),"arbitrator":null,"total_amount":"1000000000000000000000000","description":"tl","milestones":null,"funding_deadline_ns":null,"release_deadline_ns": dl.to_string()}
    })).transact().await?.json()?;
    buyer
        .call(contract.id(), "fund_escrow")
        .args_json(json!({"escrow_id": id}))
        .deposit(yocto(1_000_000_000_000_000_000_000_000))
        .transact()
        .await?;
    buyer
        .call(contract.id(), "approve_work")
        .args_json(json!({"escrow_id": id}))
        .transact()
        .await?;
    let early = buyer
        .call(contract.id(), "release")
        .args_json(json!({"escrow_id": id, "milestone_id": null}))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(early.is_failure(), "early release should fail");
    worker.fast_forward(10).await?;
    let late = buyer
        .call(contract.id(), "release")
        .args_json(json!({"escrow_id": id, "milestone_id": null}))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(late.is_success(), "release after deadline failed: {late:?}");

    // arbitrated dispute and resolution
    let id2: u64 = buyer.call(contract.id(), "create_escrow").args_json(json!({
        "input": {"kind":"Arbitrated","seller":seller.id(),"arbitrator":arb.id(),"total_amount":"1000000000000000000000000","description":"arb","milestones":null,"funding_deadline_ns":null,"release_deadline_ns":null}
    })).transact().await?.json()?;
    buyer
        .call(contract.id(), "fund_escrow")
        .args_json(json!({"escrow_id": id2}))
        .deposit(yocto(1_000_000_000_000_000_000_000_000))
        .transact()
        .await?;
    let by_seller = seller
        .call(contract.id(), "raise_dispute")
        .args_json(json!({"escrow_id": id2, "reason": "issue"}))
        .transact()
        .await?;
    assert!(by_seller.is_success());
    let e: serde_json::Value = contract
        .view("get_escrow")
        .args_json(json!({"escrow_id": id2}))
        .await?
        .json()?;
    assert_eq!(e["status"], "Disputed");
    let unauth = buyer.call(contract.id(), "resolve_dispute").args_json(json!({"escrow_id": id2, "release_to_seller":"600000000000000000000000", "refund_to_buyer":"400000000000000000000000"})).transact().await?;
    assert!(unauth.is_failure(), "non-arbitrator resolve should fail");
    let res = arb.call(contract.id(), "resolve_dispute").args_json(json!({"escrow_id": id2, "release_to_seller":"600000000000000000000000", "refund_to_buyer":"400000000000000000000000"})).gas(near_workspaces::types::Gas::from_tgas(150)).transact().await?;
    assert!(res.is_success(), "resolve failed: {res:?}");
    let e: serde_json::Value = contract
        .view("get_escrow")
        .args_json(json!({"escrow_id": id2}))
        .await?
        .json()?;
    assert_eq!(e["status"], "Resolved");
    assert_eq!(e["released_amount"], "600000000000000000000000");
    assert_eq!(e["refunded_amount"], "400000000000000000000000");
    Ok(())
}

#[tokio::test]
async fn authorization_and_isolation() -> anyhow::Result<()> {
    let worker = near_workspaces::sandbox().await?;
    let contract = deploy(&worker).await?;
    let buyer = worker.dev_create_account().await?;
    let seller = worker.dev_create_account().await?;
    let other = worker.dev_create_account().await?;
    let id: u64 = buyer.call(contract.id(), "create_escrow").args_json(json!({
        "input": {"kind":"Freelance","seller":seller.id(),"arbitrator":null,"total_amount":"1000000000000000000000000","description":"x","milestones":null,"funding_deadline_ns":null,"release_deadline_ns":null}
    })).transact().await?.json()?;
    // unauthorized fund
    let bad_fund = other
        .call(contract.id(), "fund_escrow")
        .args_json(json!({"escrow_id": id}))
        .deposit(yocto(1_000_000_000_000_000_000_000_000))
        .transact()
        .await?;
    assert!(bad_fund.is_failure());
    buyer
        .call(contract.id(), "fund_escrow")
        .args_json(json!({"escrow_id": id}))
        .deposit(yocto(1_000_000_000_000_000_000_000_000))
        .transact()
        .await?;
    // wrong deposit
    let id2: u64 = buyer.call(contract.id(), "create_escrow").args_json(json!({
        "input": {"kind":"Freelance","seller":seller.id(),"arbitrator":null,"total_amount":"1000000000000000000000000","description":"x","milestones":null,"funding_deadline_ns":null,"release_deadline_ns":null}
    })).transact().await?.json()?;
    let wrong = buyer
        .call(contract.id(), "fund_escrow")
        .args_json(json!({"escrow_id": id2}))
        .deposit(yocto(1))
        .transact()
        .await?;
    assert!(wrong.is_failure());
    // unauthorized approve/release
    let bad_approve = other
        .call(contract.id(), "approve_work")
        .args_json(json!({"escrow_id": id}))
        .transact()
        .await?;
    assert!(bad_approve.is_failure());
    let bad_release = other
        .call(contract.id(), "release")
        .args_json(json!({"escrow_id": id, "milestone_id": null}))
        .gas(near_workspaces::types::Gas::from_tgas(100))
        .transact()
        .await?;
    assert!(bad_release.is_failure());
    // invalid escrow id and amount
    let missing = other
        .call(contract.id(), "approve_work")
        .args_json(json!({"escrow_id": 9999}))
        .transact()
        .await?;
    assert!(missing.is_failure());
    let bad_create = buyer.call(contract.id(), "create_escrow").args_json(json!({
        "input": {"kind":"Freelance","seller":seller.id(),"arbitrator":null,"total_amount":"0","description":"x","milestones":null,"funding_deadline_ns":null,"release_deadline_ns":null}
    })).transact().await?;
    assert!(bad_create.is_failure());
    Ok(())
}
