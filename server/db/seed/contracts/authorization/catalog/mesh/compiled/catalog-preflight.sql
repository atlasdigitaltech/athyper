-- GENERATED. DO NOT EDIT.
-- wave2.mesh.catalog.v1
-- Resolution is exact by permission UUID; this file contains no suffix/token inference.
BEGIN;

CREATE TEMP TABLE wave2_compiled_catalog (
    operation_id uuid NOT NULL,
    permission_id uuid NOT NULL,
    entity_code text NOT NULL,
    operation_code text NOT NULL,
    canonical_permission_code text NOT NULL,
    operation_kind text NOT NULL,
    idempotency_mode text NOT NULL,
    risk_tier text NOT NULL,
    requires_mfa boolean NOT NULL,
    requires_sod boolean NOT NULL,
    is_shareable boolean NOT NULL,
    is_delegable boolean NOT NULL,
    definition_sha256 text NOT NULL,
    planes_csv text NOT NULL,
    PRIMARY KEY (operation_id),
    UNIQUE (permission_id),
    UNIQUE (canonical_permission_code),
    UNIQUE (entity_code, operation_code)
) ON COMMIT DROP;

INSERT INTO wave2_compiled_catalog VALUES
    ('c4493ce9-2c71-56e2-af2a-5dddd05df13e', '4060efc9-0961-500b-abe6-a4b0387baa26', 'attachment', 'create', 'mesh.catalog.attachment.create', 'mutation', 'idempotency_key_required', 'medium', false, false, false, true, 'c37282708776ab5813ad67f6c2c74df76aacca14d0977c5bbfe63a96ff08829b', 'mesh'),
    ('3ab840d5-0636-5295-a9d8-f387735dc6a3', '6d88bc96-fc04-53bc-a23b-29090ac44446', 'attachment', 'delete', 'mesh.catalog.attachment.delete', 'mutation', 'idempotency_key_required', 'high', true, true, false, false, 'cc38ca3985f7eaf675519866eae299b7ff43cff392991235f27f22826d3656a4', 'mesh'),
    ('002f2647-43b7-5f85-bc86-2b67d3b8342c', 'd5169b57-85cc-576f-bea6-4cfded4b301b', 'attachment', 'read', 'mesh.catalog.attachment.read', 'read', 'idempotent', 'low', false, false, false, true, '4dad3a768e066ce9605d68144a771f9a3b6b8874edeba089cda60efe2217f543', 'mesh'),
    ('c54fd769-26cd-588e-9ea2-017f04ca65b9', 'a045b342-005e-524b-91a4-4be958e81c5b', 'attachment', 'share', 'mesh.catalog.attachment.share', 'mutation', 'idempotency_key_required', 'medium', false, false, false, true, '34e861da33602b41fae9289fe6cd4dde400954438d9ac6cd34aa59456b2b4325', 'mesh'),
    ('89acadbc-8ca9-519d-927c-71297f361b60', '4dea5253-cd94-51fe-8c40-9bd6aceff02f', 'bank_account', 'read', 'mesh.catalog.bank_account.read', 'read', 'idempotent', 'low', false, false, false, true, 'dbe041373683dd53b039e6c5302f69c0e23bf6dc1e8e8f1518bfd69b0e3029dd', 'mesh'),
    ('cf85d8d7-d9af-595b-90f8-64eb7b6c7b6a', '198bff99-7c71-547b-b39d-1dcf14924d72', 'bank_account', 'update', 'mesh.catalog.bank_account.update', 'mutation', 'idempotency_key_required', 'medium', false, false, false, true, '1e5d82e9dc94b5b3098592fceb1e80f37fdbce3ca334ff24547dc8b6da34beb8', 'mesh'),
    ('56c8bb59-59eb-5673-9645-d4fc5bb4b2ff', 'e1845d6b-72a0-5629-bb17-8f9867eb8303', 'bank_account', 'verify', 'mesh.catalog.bank_account.verify', 'mutation', 'idempotency_key_required', 'high', true, true, false, false, '7d673ff41ee8ebe3ac67d6bcbf72a5520d7b2b293946b9fc87babdcc2440b041', 'mesh'),
    ('11b48d4b-8504-54d9-8853-9e5136313f71', '1524424a-39cc-5a64-b526-e9fe428bd8f9', 'catalog', 'publish', 'mesh.catalog.catalog.publish', 'mutation', 'idempotency_key_required', 'high', true, true, false, false, 'cb7ac32c2dbfc5d1695a3d8dd534362d39154be97657a677f29f37b7a12a866d', 'mesh'),
    ('64104d61-c218-5eb1-9b25-d6e656be29d7', '5b7451f1-98c1-561d-b8ae-3911e9ebba43', 'catalog', 'read', 'mesh.catalog.catalog.read', 'read', 'idempotent', 'low', false, false, false, true, '7b76226a090db2efb389558789e6773738f1e3ddc1decc47942405b38a32e88b', 'mesh'),
    ('5a20ab08-9e22-5942-a52c-6f309f63e3ef', '1b5cfc3b-98bf-5f65-b189-e5f1b3363861', 'content_item', 'create', 'mesh.catalog.content_item.create', 'mutation', 'idempotency_key_required', 'medium', false, false, false, true, 'b80a11431fd2a0b43492153d7445b642b9eac1d007bb01c26e57c2ccf2c851d7', 'mesh'),
    ('6eefceff-f662-5c33-b26c-4cb374f741e6', '76212049-e5a4-5092-8669-254fc0adab1a', 'content_item', 'read', 'mesh.catalog.content_item.read', 'read', 'idempotent', 'low', false, false, false, true, 'f4aaf1c7b7bc352eb890b42f1f040da0a93f268d266b7a838933d7f21d39dcbb', 'mesh'),
    ('802e1869-0423-5932-a2bc-1ed8c4d36cce', 'd8932cd5-2a71-5068-a69a-100fed4333b4', 'content_item', 'share', 'mesh.catalog.content_item.share', 'mutation', 'idempotency_key_required', 'medium', false, false, false, true, '527f0880965f1a99f76196c68e4365e3defa219d950187e4639d860e5ed783f0', 'mesh'),
    ('0b2010bd-b292-539f-bb70-d944109a35bc', 'd6d9e6a8-d056-58da-94e6-dd33237b7064', 'content_item', 'update', 'mesh.catalog.content_item.update', 'mutation', 'idempotency_key_required', 'medium', false, false, false, true, '8b1146fe1e02ae8443813ce0c3b31fe1dfeab30a9faa3dd74d5657c4c735a8b3', 'mesh'),
    ('44844293-1b46-538a-95f1-9189ff35a72d', 'd9895fb9-b98f-54f4-a602-4d6cecfccf3e', 'conversation', 'add_participant', 'mesh.catalog.conversation.add_participant', 'mutation', 'idempotency_key_required', 'medium', false, false, false, true, '39fc9bfe73a42480ddd4488c8b0e13edf3fcaca59a2a59eee578ca8085cf1244', 'mesh'),
    ('597fc338-c8cf-5deb-86c4-a64f6be28d03', 'd19ff2ea-523b-54f3-a303-53cd411f20a7', 'conversation', 'create', 'mesh.catalog.conversation.create', 'mutation', 'idempotency_key_required', 'medium', false, false, false, true, '48531865eecbf04c150bb5e01c8281c0e25297b501bac3213ad37520142fb052', 'mesh'),
    ('ea5d81f5-6937-50cb-8a24-9edf8a36d189', 'bb36337f-fc55-518d-ab94-017284e56edd', 'conversation', 'read', 'mesh.catalog.conversation.read', 'read', 'idempotent', 'low', false, false, false, true, '3908df770a4c7ce5d65ba396920e88b2025202ad9c3621ffd86206030e1d22bd', 'mesh'),
    ('12c7cd0d-1a14-5f33-a591-71975f81027a', '333122bc-988e-5fbb-a403-85cb1e8fd3db', 'conversation', 'remove_participant', 'mesh.catalog.conversation.remove_participant', 'mutation', 'idempotency_key_required', 'high', true, true, false, false, '6dfbd3133fb6e094980bfac3583d1f6cc839cd059d62461e7ca3cd9e8f18cde9', 'mesh'),
    ('df536fce-30ca-50ce-8e13-b8321175348f', '37035dcd-070c-50a8-a770-4ca121ddfe44', 'document_envelope', 'acknowledge', 'mesh.catalog.document_envelope.acknowledge', 'mutation', 'idempotency_key_required', 'medium', false, false, false, true, 'c3546934dbcc71760b71dcbef370354a649f01317de595d07278f1863c3b4026', 'mesh'),
    ('3b5321eb-1624-581a-ae1f-bb5118c3687e', '5585fecf-65ce-5192-950e-bfe7aff1e054', 'document_envelope', 'publish', 'mesh.catalog.document_envelope.publish', 'mutation', 'idempotency_key_required', 'high', true, true, false, false, '9f2cd7e158f060cc2d6fa0451a18161964650fa808d6b052c8fbccc7bf043d66', 'mesh'),
    ('37d4c83f-6d0a-5991-8758-b58fd704b2f7', 'fd8c1937-4fad-5829-b3de-b4b1b3cf338a', 'document_envelope', 'read', 'mesh.catalog.document_envelope.read', 'read', 'idempotent', 'low', false, false, false, true, 'd4ffce6f3153c00a67ea96e067e15c3fc98089d217d1eeb6b86587a17d7693bc', 'mesh'),
    ('1a60333b-cba2-5e2a-961f-577ab1477dbc', 'a29f1384-65ca-54d3-bf72-c3bea98e43f4', 'document_envelope', 'replay', 'mesh.catalog.document_envelope.replay', 'mutation', 'idempotency_key_required', 'medium', false, false, false, true, '536642b181a27319e0aa7694df1eac0f453d2c071c447d642cf3523585799207', 'mesh'),
    ('94339901-2b7b-525f-9f9e-d2ffbc9ce96d', '9ef06b85-8b27-5f41-8afd-c9cf34dbda44', 'network_account', 'connect', 'mesh.catalog.network_account.connect', 'mutation', 'idempotency_key_required', 'medium', false, false, false, true, 'e99351a681f247950de27a9eee4e230f23233f25c402d8f897b58784976b9798', 'mesh'),
    ('9b02fe06-873b-5bed-a131-600d9475023e', '7953c5b5-4483-5e7b-a08c-c6b3a069dce6', 'network_account', 'invite', 'mesh.catalog.network_account.invite', 'mutation', 'idempotency_key_required', 'medium', false, false, false, true, 'ad57e6a76bf1bb5b7f48568da08b1ac4d01d4e6ce5b108a80a466a734d1f890f', 'mesh'),
    ('7dedcf53-42f9-57d7-942b-2fb7b6a8ae45', '2912b007-d4d3-555c-a7f4-98970e94d9dd', 'network_account', 'read', 'mesh.catalog.network_account.read', 'read', 'idempotent', 'low', false, false, false, true, 'bab11b2512e83e368a558f70460757b790232e0e4a2b151a9ad2acea5660469e', 'mesh'),
    ('6f6fe879-15e3-5e74-bd18-5303069381a7', '9403d252-6448-5775-96fd-84861bec41c4', 'network_account', 'update', 'mesh.catalog.network_account.update', 'mutation', 'idempotency_key_required', 'medium', false, false, false, true, '2be02561fc8f86e502578af923bc509aafa6971f2e9eb86225271d6283a38764', 'mesh'),
    ('f6bd3abd-027b-5b86-a4c6-1fb1d0fdb801', 'b44cbd4c-de13-594f-b836-8679c47de554', 'network_relationship', 'accept', 'mesh.catalog.network_relationship.accept', 'mutation', 'idempotency_key_required', 'high', true, true, false, false, 'a69ebadcb1da76d46b9cdf1ad84d4d9bb439256ccc964e5a9ebb1c7d512ac9bd', 'mesh'),
    ('f230094a-b60c-57a7-bf41-92224bef8a5c', '2cfcea48-16d5-5853-a90c-dc3882ef5526', 'network_relationship', 'read', 'mesh.catalog.network_relationship.read', 'read', 'idempotent', 'low', false, false, false, true, '0c9725057c11e028c06c1e08cdedf777ac7d10b965359446b6ce747e5a670b06', 'mesh'),
    ('bf53731b-2b0d-5218-b491-46717e586e2b', 'fed9f35b-61af-57a8-9608-797250a3f1b6', 'network_relationship', 'suspend', 'mesh.catalog.network_relationship.suspend', 'mutation', 'idempotency_key_required', 'high', true, true, false, false, 'ae4e8995680038d442092ad75d357a549c09e57222efe7f457c43d7cfdd79ecf', 'mesh'),
    ('043cc4cc-1ec1-5d48-a3cc-0f0dc7c052fd', '63343551-1809-5607-88b7-132ee31e8b81', 'network_relationship', 'terminate', 'mesh.catalog.network_relationship.terminate', 'mutation', 'idempotency_key_required', 'high', true, true, false, false, '68b6b9b0b890bef51a8534b166ad637bd65816a7bf5c67bd3cbf7e1720d4bde0', 'mesh'),
    ('b0e51a46-ae3c-5b4d-8276-d54e219c33f9', 'dfb4bedf-4e41-50c1-bd7e-b06a1ab3ca71', 'supplier_profile_verification', 'read', 'mesh.catalog.supplier_profile_verification.read', 'read', 'idempotent', 'low', false, false, false, true, 'fe51ad8f55f744a2e58799be6ca7d978f35b3510bba66c75275e63ae946d0c21', 'mesh'),
    ('fe7ac7d3-2f2e-5ebd-b518-7f32bd160f16', '56af7f78-91ed-5769-9b97-9ddd65106bc0', 'supplier_profile_verification', 'reject', 'mesh.catalog.supplier_profile_verification.reject', 'mutation', 'idempotency_key_required', 'high', true, true, false, false, '28e6dcdafd5c8f0ba48b6bda682d65fd7c037c05a763f2976365e8178a187da3', 'mesh'),
    ('18e1b21b-4549-5e9c-9923-2dd468ce1d84', '779daf91-90ba-57cb-a82c-4ffe63934535', 'supplier_profile_verification', 'verify', 'mesh.catalog.supplier_profile_verification.verify', 'mutation', 'idempotency_key_required', 'high', true, true, false, false, '182123d4420a2a59e0f5370e8f4222259935fc5d7cf2ac253ea1b25ca97944b8', 'mesh');


DO $wave2$
DECLARE
    v_missing text[];
BEGIN
    SELECT array_agg(source_relation ORDER BY source_relation)
      INTO v_missing
      FROM unnest(ARRAY[
        'mesh.network_account',
        'mesh.network_relationship',
        'mesh.document_envelope',
        'mesh.attachment',
        'mesh.conversation',
        'mesh.content_item',
        'mesh.bank_account',
        'mesh.catalog',
        'mesh.supplier_profile_verification'
      ]::text[]) source_relation
     WHERE to_regclass(source_relation) IS NULL;
    IF cardinality(v_missing) > 0 THEN
        RAISE EXCEPTION 'Wave 2 Mesh source relations are missing: %', v_missing;
    END IF;
END
$wave2$;

-- The apply phase is intentionally generated after the exact entity-resolution
-- preflight. Installation remains a separate, approval-gated deployment step.
-- catalog_owner_id=00000000-0000-7000-8000-000000000030

ROLLBACK;
