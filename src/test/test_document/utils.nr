use crate::DocumentRegistry;
use dep::aztec::test::helpers::test_environment::TestEnvironment;
use dep::aztec::protocol_types::address::AztecAddress;

pub fn setup() -> (TestEnvironment, AztecAddress, AztecAddress) {
    let mut env = TestEnvironment::new();
    let admin = env.create_light_account();

    let initializer = DocumentRegistry::interface().constructor();
    let registry_address = env.deploy("DocumentRegistry").with_public_initializer(admin, initializer);

    (env, registry_address, admin)
}

pub fn create_test_cid(value: u8) -> [u8; 32] {
    let mut cid = [0; 32];
    cid[31] = value;
    cid
}

pub fn create_test_fingerprint(value: u8) -> [u8; 32] {
    let mut fpr = [0; 32];
    fpr[31] = value;
    fpr
}

pub fn create_test_tl_root(value: u8) -> [u8; 32] {
    let mut root = [0; 32];
    root[31] = value;
    root
}
