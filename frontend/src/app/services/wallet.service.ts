import { Injectable, NgZone } from '@angular/core';

import { PublicClient, createPublicClient, http } from 'viem';
import { mainnet } from 'viem/chains';

import { Web3Modal, createWeb3Modal } from '@web3modal/wagmi';
import { coinbaseWallet, walletConnect } from '@wagmi/connectors';
import {
  Config,
  GetAccountReturnType,
  createConfig,
  disconnect,
  getAccount,
  injected,
  reconnect,
  signMessage,
  signTypedData,
  watchAccount,
} from '@wagmi/core';

import { Observable } from 'rxjs';

import { env } from '@/../env/env';

const projectId = 'd183619f342281fd3f3ff85716b6016a';

const metadata = {
  name: 'Ethereum Phunks',
  description: '',
  url: 'https://ethereumphunks.com',
  icons: [],
};

const themeVariables = {
  '--w3m-font-family': 'Montserrat, sans-serif',
  '--w3m-accent': 'rgba(var(--highlight), 1)',
  '--w3m-z-index': 99999,
  '--w3m-border-radius-master': '0',
};

@Injectable()
export class WalletService {
  // maxCooldown = 4;
  // web3Connecting: boolean = false;
  connectedState$!: Observable<GetAccountReturnType>;

  client!: PublicClient;
  config!: Config;
  modal!: Web3Modal;

  constructor(private ngZone: NgZone) {
    this.client = createPublicClient({
      chain: mainnet,
      transport: http(env.rpcHttpProvider),
    });

    this.config = createConfig({
      chains: [mainnet],
      transports: {
        [1]: http(env.rpcHttpProvider),
      },
      connectors: [
        walletConnect({
          projectId,
          metadata,
          showQrModal: false,
        }),
        injected({ shimDisconnect: true }),
        coinbaseWallet({
          appName: metadata.name,
          appLogoUrl: metadata.icons[0],
        }),
      ],
    });

    this.modal = createWeb3Modal({
      wagmiConfig: this.config,
      projectId,
      enableAnalytics: false,
      themeVariables,
    });


    this.connectedState$ = new Observable((observer) =>
      watchAccount(this.config, {
        onChange: (account) => this.ngZone.run(() => observer.next(account)),
      })
    );

    reconnect(this.config);
  }

  async connect(): Promise<void> {
    try {
      await this.modal.open();
    } catch (error) {
      console.log(error);
      this.disconnectWeb3();
    }
  }

  async disconnectWeb3(): Promise<void> {
    if (getAccount(this.config).isConnected) {
      await disconnect(this.config);
    }
  }

  async signTypedMessage(typedData: any): Promise<{
    signature: `0x${string}`;
    address: `0x${string}`;
  }> {
    // TODO(v3): If typedData includes RoleID/RoleName, these are deprecated and will be removed when legacy buttons are phased out
    const account = getAccount(this.config);
    if (!account.isConnected) throw new Error('Wallet not connected');

    const signature = await signTypedData(this.config, typedData);

    return {
      signature,
      address: account.address as `0x${string}`,
    };
  }
}
