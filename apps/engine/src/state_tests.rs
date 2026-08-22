
use super::*;

// maker rests, taker crosses -> both end up with a position
fn cross_open(
    e: &mut Engine,
    m: &str,
    oid_maker: &str,
    oid_taker: &str,
    maker: &str,
    taker: &str,
    taker_long: bool,
    price: f64,
    qty: &str,
    lev: u32,
    taker_mode: &str,
    maker_mode: &str,
) {
    let (ms, ts) = if taker_long {
        ("short", "long")
    } else {
        ("long", "short")
    };
    e.create_order(
        oid_maker.into(),
        maker.into(),
        m.into(),
        ms.into(),
        price,
        qty.into(),
        lev,
        "limit".into(),
        "".into(),
        maker_mode.into(),
    );
    e.create_order(
        oid_taker.into(),
        taker.into(),
        m.into(),
        ts.into(),
        price,
        qty.into(),
        lev,
        "limit".into(),
        "".into(),
        taker_mode.into(),
    );
}

fn has_pos(e: &Engine, user: &str, market: &str) -> bool {
    e.positions
        .get(user)
        .map(|ps| ps.contains_key(market))
        .unwrap_or(false)
}

#[allow(clippy::too_many_arguments)]
fn place(
    e: &mut Engine,
    oid: &str,
    user: &str,
    m: &str,
    side: &str,
    price: f64,
    qty: &str,
    lev: u32,
    otype: &str,
    client: &str,
    mode: &str,
) -> serde_json::Value {
    e.create_order(
        oid.into(),
        user.into(),
        m.into(),
        side.into(),
        price,
        qty.into(),
        lev,
        otype.into(),
        client.into(),
        mode.into(),
    )
}

fn pos_qty(e: &Engine, user: &str, market: &str) -> Decimal {
    e.positions
        .get(user)
        .and_then(|ps| ps.get(market))
        .map(|p| p.qty)
        .unwrap_or(Decimal::ZERO)
}

#[test]
fn isolated_liquidation_closes_only_the_losing_position() {
    let mut e = Engine::new();
    e.create_market("M".into());
    e.onramp("A".into(), "1000".into());
    e.onramp("B".into(), "1000".into());

    // A long 1@100 x10 isolated ; B short is the maker
    cross_open(
        &mut e, "M", "b1", "a1", "B", "A", true, 100.0, "1", 10, "isolated", "isolated",
    );
    assert!(has_pos(&e, "A", "M"), "A should have opened a long");
    assert!(has_pos(&e, "B", "M"), "B should have opened a short");

    // mark down to 90 -> A long liquidates (equity 0 <= maint 0.5), B short survives
    e.mark_price_update("M".into(), "90".into());
    assert!(!has_pos(&e, "A", "M"), "A long must be liquidated");
    assert!(has_pos(&e, "B", "M"), "B short must survive");
}

#[test]
fn cross_liquidation_spares_isolated_position() {
    let mut e = Engine::new();
    e.create_market("M1".into());
    e.create_market("M2".into());
    e.onramp("A".into(), "25".into()); // just enough for two 10-margin positions + fees
    e.onramp("B".into(), "1000".into());
    e.onramp("C".into(), "1000".into());

    // A: cross long M1 (vs B) AND isolated long M2 (vs C)
    cross_open(
        &mut e, "M1", "b1", "a1", "B", "A", true, 100.0, "1", 10, "cross", "isolated",
    );
    cross_open(
        &mut e, "M2", "c1", "a2", "C", "A", true, 100.0, "1", 10, "isolated", "isolated",
    );
    assert!(has_pos(&e, "A", "M1"), "A cross M1 should open");
    assert!(has_pos(&e, "A", "M2"), "A isolated M2 should open");

    // push M1 down -> A's cross account underwater -> cross liq closes M1 ONLY
    e.mark_price_update("M1".into(), "85".into());
    assert!(!has_pos(&e, "A", "M1"), "cross M1 must be liquidated");
    assert!(has_pos(&e, "A", "M2"), "isolated M2 must be untouched");
}

#[test]
fn fees_accrue_to_insurance_fund() {
    let mut e = Engine::new();
    e.create_market("M".into());
    e.onramp("A".into(), "1000".into());
    e.onramp("B".into(), "1000".into());
    cross_open(
        &mut e, "M", "b1", "a1", "B", "A", true, 100.0, "1", 10, "isolated", "isolated",
    );
    // taker 0.05% + maker 0.02% of notional 100 = 0.05 + 0.02 = 0.07
    assert_eq!(
        e.insurance_fund,
        Decimal::new(7, 2),
        "fees exactly 0.07 into the fund"
    );
}

#[test]
fn bankrupt_liquidation_triggers_adl() {
    let mut e = Engine::new();
    e.create_market("M".into());
    e.onramp("A".into(), "1000".into());
    e.onramp("B".into(), "1000".into());
    // A long 1@100 x10 isolated ; B short winner
    cross_open(
        &mut e, "M", "b1", "a1", "B", "A", true, 100.0, "1", 10, "isolated", "isolated",
    );

    // mark to 50: A loses 50 on 10 margin -> bankrupt, deficit 40 >> fees (0.07)
    // fund goes negative -> ADL claws B's winning short (+50) to refill it
    e.mark_price_update("M".into(), "50".into());
    assert!(!has_pos(&e, "A", "M"), "bankrupt long must liquidate");
    assert!(
        !has_pos(&e, "B", "M"),
        "winning short must be auto-deleveraged"
    );
    assert!(
        e.insurance_fund >= Decimal::ZERO,
        "ADL restores fund to >= 0"
    );
}

#[test]
fn cross_offset_keeps_position_alive() {
    let mut e = Engine::new();
    e.create_market("M1".into());
    e.create_market("M2".into());
    e.onramp("A".into(), "25".into());
    e.onramp("B".into(), "1000".into());
    e.onramp("C".into(), "1000".into());

    // A cross long M1 (vs B short, lev1 so B never liquidates)
    place(
        &mut e, "b1", "B", "M1", "short", 100.0, "1", 1, "limit", "", "isolated",
    );
    place(
        &mut e, "a1", "A", "M1", "long", 100.0, "1", 10, "limit", "", "cross",
    );
    // A cross short M2 (vs C long, lev1 so C never liquidates)
    place(
        &mut e, "c1", "C", "M2", "long", 100.0, "1", 1, "limit", "", "isolated",
    );
    place(
        &mut e, "a2", "A", "M2", "short", 100.0, "1", 10, "limit", "", "cross",
    );
    assert!(has_pos(&e, "A", "M1") && has_pos(&e, "A", "M2"));

    // M2 drops -> A short M2 wins (+20). M1 crashes -> A long M1 loses (-30).
    // Isolated, M1 (equity 10-30=-20) would die. In cross, M2's +20 offsets it -> survives.
    e.mark_price_update("M2".into(), "80".into());
    e.mark_price_update("M1".into(), "70".into());
    assert!(
        has_pos(&e, "A", "M1"),
        "cross M1 survives via the M2 offset"
    );
    assert!(has_pos(&e, "A", "M2"), "cross M2 survives");
}

#[test]
fn duplicate_client_id_is_deduped() {
    let mut e = Engine::new();
    e.create_market("M".into());
    e.onramp("A".into(), "1000".into());
    e.onramp("B".into(), "1000".into());
    // B rests short qty 2 so a duplicate could (wrongly) fill twice
    place(
        &mut e, "b1", "B", "M", "short", 100.0, "2", 10, "limit", "", "isolated",
    );

    let _r1 = place(
        &mut e, "a1", "A", "M", "long", 100.0, "1", 10, "limit", "cid1", "isolated",
    );
    let r2 = place(
        &mut e, "a2", "A", "M", "long", 100.0, "1", 10, "limit", "cid1", "isolated",
    );

    assert_eq!(
        r2["status"],
        serde_json::json!("Duplicate"),
        "same clientId must dedupe"
    );
    assert_eq!(
        pos_qty(&e, "A", "M"),
        Decimal::from(1),
        "duplicate must not grow the position"
    );
}

#[test]
fn unfilled_market_order_refunds_margin_and_rests_nothing() {
    let mut e = Engine::new();
    e.create_market("M".into());
    e.onramp("A".into(), "1000".into());
    let before = e.balances.get("A").unwrap().available;

    // no liquidity -> market buy fills nothing -> IOC cancels, must refund all margin
    let r = place(
        &mut e, "a1", "A", "M", "long", 100.0, "1", 10, "market", "", "isolated",
    );
    assert_eq!(r["status"], serde_json::json!("Cancelled"));

    let bal = e.balances.get("A").unwrap();
    assert_eq!(
        bal.available, before,
        "unfilled market order must refund all margin"
    );
    assert_eq!(bal.locked, Decimal::ZERO, "no margin may stay locked");
    assert!(
        !has_pos(&e, "A", "M"),
        "no position from an unfilled market order"
    );

    let (bids, asks) = e.orderbooks.get("M").unwrap().depth();
    assert!(
        bids.is_empty() && asks.is_empty(),
        "IOC must never rest on the book"
    );
}

#[test]
fn closing_a_position_removes_it() {
    let mut e = Engine::new();
    e.create_market("M".into());
    e.onramp("A".into(), "1000".into());
    e.onramp("B".into(), "1000".into());
    e.onramp("D".into(), "1000".into());

    // A opens long 1@100 (vs B short)
    cross_open(
        &mut e, "M", "b1", "a1", "B", "A", true, 100.0, "1", 10, "isolated", "isolated",
    );
    assert!(has_pos(&e, "A", "M"));

    // A closes by selling into D's resting bid -> opposite-side fill closes A's long
    place(
        &mut e, "d1", "D", "M", "long", 100.0, "1", 10, "limit", "", "isolated",
    );
    place(
        &mut e, "a2", "A", "M", "short", 100.0, "1", 10, "limit", "", "isolated",
    );
    assert!(!has_pos(&e, "A", "M"), "A's long should be fully closed");
}
