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
        // Only log detailed errors in development (check for localhost)
        if (window.location.hostname === 'localhost') {
          // Error already handled by UI feedback
        }
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
      address: '',  // Will be filled in when wallet is connected
      userId: arr[0],
      userTag: arr[1],
      avatar: arr[2],
      discordId: arr[3],
      discordName: arr[4],
      discordIcon: arr[5],
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

    try {
      // Set signing state
      this.setState({ messageSigning: true, errorMessage: null });

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
          { name: 'Nonce', type: 'string' },
          { name: 'Expiry', type: 'uint256' },
        ]
      };

      const message = {
        UserID: data.userId,
        UserTag: data.userTag,
        ServerID: data.discordId,
        ServerName: data.discordName,
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
      
      // Update state after signing
      this.setState({ messageSigning: false, messageSigned: true });
      
      if (!signature) {
        return this.setState({ errorMessage: 'Failed to sign message' });
      }

      await firstValueFrom(
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
          catchError((error) => {
            // Handle HTTP errors (like when user doesn't have required assets)
            let errorMessage = 'Verification failed. Please try again.';
            
            // Try different ways to extract the error message
            if (error.error) {
              if (typeof error.error === 'string') {
                errorMessage = error.error;
              } else if (error.error.message) {
                errorMessage = error.error.message;
              }
            } else if (error.message) {
              errorMessage = error.message;
            }
            
            // If it's still the generic message, try to extract from statusText
            if (errorMessage === 'Verification failed. Please try again.' && error.statusText) {
              errorMessage = error.statusText;
            }
            
            this.setState({ errorMessage });
            return of(null);
          })
        )
      );
    } catch (error) {
      // Handle wallet signing errors
      const errorMessage = error instanceof Error ? error.message : 'Failed to sign message with wallet';
      this.setState({ 
        messageSigning: false,
        errorMessage
      });
    }
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
