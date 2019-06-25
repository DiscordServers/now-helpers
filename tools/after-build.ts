import axios from 'axios';
import { writeFileSync } from 'fs';
import { join as pathJoin } from 'path';

async function getCloudflareRanges() {
  let ipRanges: string[] = [];

  for (const protocolVersion of ['v4', 'v6']) {
    const protocolRanges = await axios.get(`https://www.cloudflare.com/ips-${protocolVersion}`);

    ipRanges = ipRanges.concat(protocolRanges.data.trim().split('\n'));
  }

  console.log(ipRanges);

  return ipRanges;
}

async function run() {
  const cfRanges = await getCloudflareRanges();

  writeFileSync(pathJoin(__dirname, '../dist/cf-ranges.json'), JSON.stringify(cfRanges));

  console.log('Successfully added Cloudflare\'s ip ranges');
}

try {
  run();
} catch (error) {
  console.error(error);
  process.exit(1);
}
