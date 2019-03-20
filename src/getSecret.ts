import {CredentialsOptions} from 'aws-sdk/lib/credentials';
import {AWSSecretsManagerAdapter, Secretary} from 'secretary-secrets';

let manager: Secretary              = null;
let credentials: CredentialsOptions = null;

export default async (path: string, key: string): Promise<string> => {
    await initialize(credentials);

    return manager.fetchSecret(path, key);
};

export async function initialize(initialConfigs: CredentialsOptions): Promise<void> {
    if (manager) {
        return;
    }
    credentials = initialConfigs;

    console.log('Initializing Secretary');
    manager = new Secretary({
        adapter: new AWSSecretsManagerAdapter({
            credentials,
            region:      'us-east-1',
            httpOptions: {
                timeout: 2000,
            },
            cache:       {
                enabled: true,
            },
        }),
    });
}
