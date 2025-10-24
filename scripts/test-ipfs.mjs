import { create as createIpfsClient } from 'ipfs-http-client';

try {
    const ipfs = createIpfsClient({ url: 'http://127.0.0.1:8002' });
    const testData = Buffer.from('Hello IPFS!');
    const { cid } = await ipfs.add(testData);
    console.log('✅ IPFS working! CID:', cid.toString());
} catch (err) {
    console.error('❌ IPFS error:', err.message);
}
