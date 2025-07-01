import { AsyncPipe, JsonPipe, NgTemplateOutlet } from '@angular/common';
import { Component } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { HttpClient } from '@angular/common/http';

import { BehaviorSubject, Observable, catchError, firstValueFrom, map, of, switchMap, tap } from 'rxjs';

import { WalletService } from '@/services/wallet.service';

import { DecodedData } from '@/models/app.interface';

import { env } from 'src/env/env';

interface State {
  walletConnecting: boolean;
  walletConnected: boolean;
  messageSigning: boolean;
  messageSigned: boolean;
  messageVerified: boolean;
  errorMessage: string | null;
};

@Component({
  selector: 'app-verify',
  standalone: true,
  imports: [
    AsyncPipe,
    JsonPipe,

    NgTemplateOutlet
  ],
  providers: [
    WalletService
  ],
  templateUrl: './verify.component.html',
  styleUrl: './verify.component.scss'
})
export class VerifyComponent {

  routeData$!: Observable<DecodedData | null>;

  state$: BehaviorSubject<State> = new BehaviorSubject<State>({
    walletConnecting: false,
    walletConnected: false,
    messageSigning: false,
    messageSigned: false,
    messageVerified: false,
    errorMessage: null,
  });

  constructor(
    private route: ActivatedRoute,
    public walletSvc: WalletService,
    private http: HttpClient
  ) {

    // Decode data from route
    this.routeData$ = this.route.params.pipe(
      map((params: any) => this.decodeData(params.data)),
      catchError((err) => {
        console.error(err);
        this.setState({ errorMessage: 'Failed to decode data' });
        return of(null);
      }),
    );

    // Set connected state to local state
    this.walletSvc.connectedState$.pipe(
      tap((account) => {
        this.setState({
          walletConnecting: account.isConnecting,
          walletConnected: account.isConnected,
        });
      })
    ).subscribe();
  }

  /**
   * Decodes the given data string and returns the decoded data as a shaped object.
   * @param data - The data string to decode.
   * @returns The decoded data object.
   * @throws Error if the decoding or parsing fails.
   */
  decodeData(data: string): DecodedData {
    const decodedData = atob(data);
    if (!decodedData) throw new Error('Failed to decode data');

    const arr = JSON.parse(decodedData);
    if (!arr) throw new Error('Failed to parse decoded data');

    return {
      userId: arr[0],
      userTag: arr[1],
      avatar: arr[2],
      discordId: arr[3],
      discordName: arr[4],
      discordIconURL: arr[5],
      role: arr[6],
      roleName: arr[7],
      nonce: arr[8],
      expiry: arr[9],
    } as DecodedData;
  }

  /**
   * Verifies the provided data by performing the following steps:
   * 1. Checks if the verification has expired.
   * 2. Creates a message to sign using the provided data.
   * 3. Signs the message using the wallet service.
   * 4. Sends the signed message and data to the server for verification.
   *
   * @param data - The decoded data to be verified.
   * @returns A Promise that resolves to void.
   */
  async verify(data: DecodedData): Promise<void> {

    // Check if verification has expired
    const expiry = new Date(data.expiry * 1000).getTime();
    const expired = expiry < Date.now();
    if (expired) return this.setState({ errorMessage: 'This verification link has expired.' });

    // Create message to sign
    const domain = {
      name: 'verethfier',
      version: '1',
      chainId: 1,
    };

    const types = {
      Verification: [
        { name: 'UserID', type: 'string' },
        { name: 'UserTag', type: 'string' },
        { name: 'ServerID', type: 'string' },
        { name: 'ServerName', type: 'string' },
        { name: 'RoleID', type: 'string' }, // TODO(v3): deprecated, remove when legacy buttons are phased out
        { name: 'RoleName', type: 'string' }, // TODO(v3): deprecated, remove when legacy buttons are phased out
        { name: 'Nonce', type: 'string' },
        { name: 'Expiry', type: 'uint256' },
      ]
    };

    const message = {
      UserID: data.userId,
      UserTag: data.userTag,
      ServerID: data.discordId,
      ServerName: data.discordName,
      RoleID: data.role, // TODO(v3): deprecated, remove when legacy buttons are phased out
      RoleName: data.roleName, // TODO(v3): deprecated, remove when legacy buttons are phased out
      Nonce: data.nonce,
      Expiry: data.expiry,
    };

    const typedData = {
      types,
      domain,
      message,
      primaryType: 'Verification',
    };

    const { signature, address } = await this.walletSvc.signTypedMessage(typedData);
    if (!signature) return this.setState({ errorMessage: 'Failed to sign message' });

    return await firstValueFrom(
      this.http.post(env.apiUrl + '/verify-signature', {
        data: {
          ...data,
          address
        },
        signature
      }).pipe(
        map((res: any) => {
          if (res.error) {
            this.setState({ errorMessage: res.error });
            return;
          }

          this.setState({ messageVerified: true });
          return;
        }),
      )
    );
  }

  /**
   * Updates the state of the subject by merging the provided partial state object
   * with the current state.
   *
   * @param state - The partial state object containing the properties to update.
   * @returns void
   */
  setState(state: Partial<State>): void {
    this.state$.next({
      ...this.state$.value,
      ...state
    });
  }
}
