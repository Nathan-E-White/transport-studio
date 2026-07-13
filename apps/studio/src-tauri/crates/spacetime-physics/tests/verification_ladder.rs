use serde::Deserialize;
use std::{collections::BTreeSet, path::Path};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct VerificationLadder {
    contract_version: String,
    required_command: String,
    tiers: Vec<VerificationTier>,
    deferred_gates: Vec<String>,
    promotion_policy: PromotionPolicy,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct VerificationTier {
    id: TierId,
    name: String,
    status: TierStatus,
    test_targets: Vec<TestTarget>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct TestTarget {
    seam: String,
    path: String,
    evidence_test: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
#[serde(deny_unknown_fields)]
struct PromotionPolicy {
    solver_id: String,
    current_status: PromotionStatus,
    required_tier_ids: Vec<TierId>,
    unlock_condition: UnlockCondition,
}

#[derive(Debug, Copy, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum TierId {
    CrateTests,
    FixedBackground,
    CoupledToy,
}

#[derive(Debug, Copy, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum TierStatus {
    Required,
}

#[derive(Debug, Copy, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum PromotionStatus {
    Blocked,
}

#[derive(Debug, Copy, Clone, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
enum UnlockCondition {
    AllRequiredTiersPassAndExplicitCapabilityReview,
}

#[test]
fn verification_ladder_names_every_required_tier_seam_and_deferred_gate() {
    let ladder = ladder();

    assert_eq!(ladder.contract_version, "1.0.0");
    assert_eq!(ladder.required_command, "cargo test -p spacetime-physics");
    assert_eq!(
        ladder.tiers.iter().map(|tier| tier.id).collect::<Vec<_>>(),
        vec![
            TierId::CrateTests,
            TierId::FixedBackground,
            TierId::CoupledToy
        ]
    );
    assert!(
        ladder
            .tiers
            .iter()
            .all(|tier| tier.status == TierStatus::Required)
    );
    assert!(ladder.tiers.iter().all(|tier| !tier.name.trim().is_empty()));

    let seams = ladder
        .tiers
        .iter()
        .flat_map(|tier| tier.test_targets.iter().map(|target| target.seam.as_str()))
        .collect::<BTreeSet<_>>();
    assert_eq!(
        seams,
        BTreeSet::from([
            "amr-single-block-adapter",
            "bssn-source-projection",
            "geodesic-invariants",
            "grhd-toy-step",
            "imex-exchange",
            "kernel-seam",
            "m1-radiation",
            "packet-deposition",
            "primitive-recovery",
        ])
    );
    assert_eq!(
        ladder.deferred_gates.into_iter().collect::<BTreeSet<_>>(),
        BTreeSet::from([
            "amr-convergence".to_string(),
            "bondi-michel-accretion".to_string(),
            "grmhd-tests".to_string(),
            "primary-monte-carlo-radiation".to_string(),
            "strong-field-constraint-preservation".to_string(),
            "tabulated-eos".to_string(),
            "tov-static-star".to_string(),
        ])
    );
}

#[test]
fn verification_targets_exist_and_product_promotion_stays_blocked() {
    let ladder = ladder();
    let repo_root = Path::new(env!("CARGO_MANIFEST_DIR")).join("../../../../..");

    for target in ladder.tiers.iter().flat_map(|tier| &tier.test_targets) {
        let path = repo_root.join(&target.path);
        assert!(
            path.is_file(),
            "missing {} target at {}",
            target.seam,
            target.path
        );
        let source = std::fs::read_to_string(path).expect("read verification target");
        assert!(
            source.contains(&format!("#[test]\nfn {}(", target.evidence_test)),
            "missing evidence test {} for {}",
            target.evidence_test,
            target.seam
        );
    }

    assert_eq!(
        ladder.promotion_policy.solver_id,
        "relativistic-multiphysics"
    );
    assert_eq!(
        ladder.promotion_policy.current_status,
        PromotionStatus::Blocked
    );
    assert_eq!(
        ladder.promotion_policy.required_tier_ids,
        vec![
            TierId::CrateTests,
            TierId::FixedBackground,
            TierId::CoupledToy
        ]
    );
    assert_eq!(
        ladder.promotion_policy.unlock_condition,
        UnlockCondition::AllRequiredTiersPassAndExplicitCapabilityReview
    );

    let capabilities: serde_json::Value = serde_json::from_str(include_str!(
        "../../../../../../fixtures/contracts/v1-solver-capabilities.json"
    ))
    .expect("valid solver capability contract");
    let solver = capabilities["solvers"]
        .as_array()
        .expect("solver array")
        .iter()
        .find(|solver| solver["id"] == ladder.promotion_policy.solver_id)
        .expect("relativistic multiphysics solver metadata");

    assert_eq!(solver["status"], "gated");
    assert_eq!(solver["claimStatus"], "substrate");
}

fn ladder() -> VerificationLadder {
    serde_json::from_str(include_str!(
        "../../../../../../fixtures/contracts/relativistic-verification-ladder.json"
    ))
    .expect("valid relativistic verification ladder")
}
