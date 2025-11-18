import fs from 'node:fs';
import path from 'node:path';
import { Noir } from '@noir-lang/noir_js';

async function testCircuitWithKnownInputs() {
    console.log('Testing RSA circuit with known-good test vector from noir_rsa...\n');
    
    // From noir_rsa test: test_verify_sha256_pkcs1v15_2048
    const sha256_hash = [
        91, 207, 46, 60, 22, 153, 217, 144, 2, 127, 224, 143, 181, 45, 32, 120, 
        122, 131, 166, 79, 166, 183, 43, 158, 116, 105, 73, 207, 196, 77, 33, 5
    ];
    
    const modulus_limbs = [
        '686795698292800269907643537356738579',
        '964535336286604332865608618951812932',
        '875489607050780866666127244047609290',
        '923346736298682921577234326042732171',
        '35488125619877691965451339945611891',
        '882039336772244050227327944621703709',
        '213978809393524862758766181563173299',
        '904107072150156110618693927067927667',
        '608681787812434397766846615734222676',
        '234336711699271919057267754896230501',
        '863395235327874085233022038541992297',
        '333019446032695938199682010089949961',
        '928696405995765110425295318884426022',
        '378472512056433407966625100852585698',
        '693883393348181261068372536958394797',
        '840017942970021161698764341439545545',
        '459396362733478961073832114736322663',
        '200'
    ];
    
    const redc_limbs = [
        '89931932831326162230762022485250831',
        '953906547267041275793896473881665525',
        '125913500741485157226741587348398015',
        '219402261455430732466951787535222266',
        '373019107076134913695494160202147085',
        '193751159905423429321410035319603884',
        '1032076171904328572726929719650214068',
        '222089693738330491367503974616256441',
        '472465252341423857106043043059761496',
        '166019913765482885678431738473535503',
        '304381610050604932978772003734564030',
        '438017062641642151675616037684654212',
        '655206760513433813372859033744498207',
        '695792063962657038325463410739499510',
        '608251975915229389285082726879781839',
        '75084653649683911408617161597015895',
        '283683829206341819664021343255673067',
        '5231'
    ];
    
    // Signature from test_verify_sha256_pkcs1v15_2048 - as limbs
    const signature_limbs = [
        '0xad29e07d16a278de49a371b9760a27',
        '0x86311920cc0e17a3c20cdff4c56dbb',
        '0x863556c6c5247dd83668dd825716ae',
        '0xc247c960945f4485b46c33b87425ca',
        '0x7326463c5c4cd5b08e21b938d9ed9a',
        '0x4f89fe0c82da08a0259eddb34d0da1',
        '0x43a74e76d4e1bd2666f1591889af0d',
        '0x240f7b80f0ff29f4253ee3019f832d',
        '0xc6edd131fbaaf725fd423dac52b362',
        '0x85f9732679242163e8afff44f6104d',
        '0xd3c3bbcb1757013fd6fb80f31dd9a6',
        '0x9008633f15df440e6df6d21ee585a2',
        '0x324df3425ed256e283be5b6b761741',
        '0xc60c1302929bd0e07caa4aeff4e8fd',
        '0x600d804ff13ba8d0e1bc9508714212',
        '0x50f7e75e5751d7edd61167027926be',
        '0x0db41d39442023e1420a8a84fe81d9',
        '0xab'
    ];
    const circuitPath = '../../circuits/pades_rsa_min';

    console.log('\nCompiling circuit...');
    const circuitDir = circuitPath;
    const circuitName = path.basename(circuitPath);
    const compiledPath = path.join(circuitDir, 'target', `${circuitName}.json`);


    //TODO: --skip-brillig comes from bignum, investigate
    const { execSync } = await import('node:child_process');
    execSync('nargo compile --skip-brillig-constraints-check', {
        cwd: circuitDir,
        stdio: 'inherit'
    });

    const circuit = JSON.parse(fs.readFileSync(compiledPath, 'utf-8'));

    const noir = new Noir(circuit);
    
    const noirInputs = {
        msg_hash: sha256_hash,
        modulus_limbs,
        redc_limbs,
        signature_limbs,
        exponent: 65537,
    };
    
    console.log('Attempting to generate witness with test vector...');
    try {
        const { witness } = await noir.execute(noirInputs);
        console.log('✅ SUCCESS! Witness generated successfully');
        console.log('The circuit works with test vectors from noir_rsa');
        return true;
    } catch (error: any) {
        console.log('Error:', error.message);
        if (error.stack) {
            console.error(error.stack);
        }
        return false;
    }
}

testCircuitWithKnownInputs().catch(err => {
    console.error('Test error:', err);
    process.exit(1);
});

