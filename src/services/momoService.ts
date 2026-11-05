/**
 * RestoPass MTN Mobile Money (MoMo) API Integration Service
 * 
 * Implements the official MTN MoMo Open API specification for:
 * 1. Sandbox User & API Key Provisioning (/v1_0/apiuser)
 * 2. Collection API: Token, Request-To-Pay (USSD push), Status, Account Check, Balance
 * 3. Disbursement API: Token, Transfer, Balance, Refund, Refund Status, Transfer Status
 * 4. Remittance API: Token, Transfer
 * 
 * Supports both Live HTTPS communication to sandbox.momodeveloper.mtn.com
 * and deterministic Mock Sandbox mode for offline CI and automated regression suites.
 */

import crypto from 'crypto';

export interface MomoConfig {
  baseUrl?: string;
  targetEnvironment?: 'sandbox' | 'production';
  collectionSubscriptionKey?: string;
  disbursementSubscriptionKey?: string;
  remittanceSubscriptionKey?: string;
  apiUser?: string;
  apiKey?: string;
  callbackHost?: string;
  defaultCurrency?: string;
  useMock?: boolean;
}

export interface MomoTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface RequestToPayParams {
  referenceId: string;
  amount: number | string;
  currency?: string;
  externalId: string;
  payerPhone: string;
  payerMessage?: string;
  payeeNote?: string;
}

export interface RequestToPayStatusResponse {
  financialTransactionId?: string;
  externalId: string;
  amount: string;
  currency: string;
  payer: {
    partyIdType: string;
    partyId: string;
  };
  status: 'PENDING' | 'SUCCESSFUL' | 'FAILED';
  reason?: string;
}

export interface TransferParams {
  referenceId: string;
  amount: number | string;
  currency?: string;
  externalId: string;
  payeePhone: string;
  payerMessage?: string;
  payeeNote?: string;
}

export interface RefundParams {
  referenceId: string;
  amount: number | string;
  currency?: string;
  externalId: string;
  referenceIdToRefund: string;
  payerMessage?: string;
  payeeNote?: string;
}

export interface TestCaseResult {
  testCaseId: number;
  scenarioTitle: string;
  stepDescription: string;
  apiUrl: string;
  httpMethod: string;
  expectedStatus: number;
  actualStatus: number;
  apiResponse: any;
  result: 'PASS' | 'FAIL';
  executionTimeMs: number;
}

export class MomoService {
  private config: MomoConfig;
  private tokenCache: Map<string, { token: string; expiresAt: number }> = new Map();

  // In-memory mock store for deterministic sandbox simulation
  private mockStore: {
    apiUsers: Map<string, { callbackHost: string; apiKey?: string }>;
    requestsToPay: Map<string, RequestToPayStatusResponse>;
    transfers: Map<string, any>;
    refunds: Map<string, any>;
    accounts: Map<string, { active: boolean; balance: number; currency: string }>;
  } = {
    apiUsers: new Map(),
    requestsToPay: new Map(),
    transfers: new Map(),
    refunds: new Map(),
    accounts: new Map([
      ['250788123456', { active: true, balance: 500000, currency: 'EUR' }],
      ['250788000000', { active: true, balance: 1000000, currency: 'EUR' }],
    ]),
  };

  constructor(config: MomoConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl || process.env.MOMO_BASE_URL || 'https://sandbox.momodeveloper.mtn.com',
      targetEnvironment: config.targetEnvironment || (process.env.MOMO_TARGET_ENV as any) || 'sandbox',
      collectionSubscriptionKey: config.collectionSubscriptionKey || process.env.MOMO_COLLECTION_SUBSCRIPTION_KEY || process.env.MOMO_SUBSCRIPTION_KEY || 'sandbox_mock_coll_sub_key',
      disbursementSubscriptionKey: config.disbursementSubscriptionKey || process.env.MOMO_DISBURSEMENT_SUBSCRIPTION_KEY || process.env.MOMO_SUBSCRIPTION_KEY || 'sandbox_mock_disb_sub_key',
      remittanceSubscriptionKey: config.remittanceSubscriptionKey || process.env.MOMO_REMITTANCE_SUBSCRIPTION_KEY || process.env.MOMO_SUBSCRIPTION_KEY || 'sandbox_mock_remit_sub_key',
      apiUser: config.apiUser || process.env.MOMO_API_USER || '',
      apiKey: config.apiKey || process.env.MOMO_API_KEY || '',
      callbackHost: config.callbackHost || process.env.MOMO_CALLBACK_HOST || 'staging.restopass.rw',
      defaultCurrency: config.defaultCurrency || process.env.MOMO_CURRENCY || 'EUR',
      useMock: config.useMock ?? (process.env.MOMO_USE_MOCK !== 'false' && (!process.env.MOMO_SUBSCRIPTION_KEY || process.env.NODE_ENV === 'test')),
    };
  }

  public isMock(): boolean {
    return !!this.config.useMock;
  }

  public setMock(useMock: boolean): void {
    this.config.useMock = useMock;
  }

  public setCredentials(apiUser: string, apiKey: string): void {
    this.config.apiUser = apiUser;
    this.config.apiKey = apiKey;
    // Tokens are bound to the credentials that issued them.
    this.tokenCache.clear();
  }

  private getCachedToken(scope: string): string | undefined {
    const cached = this.tokenCache.get(scope);
    if (!cached) return undefined;
    // Refresh slightly before provider expiry to avoid using a token at the boundary.
    if (cached.expiresAt <= Date.now() + 30_000) {
      this.tokenCache.delete(scope);
      return undefined;
    }
    return cached.token;
  }

  // ============================================================================
  // Test Case 1: Sandbox User Provisioning - Create Api User
  // ============================================================================
  public async createApiUser(referenceId?: string, callbackHost?: string): Promise<{ status: number; referenceId: string; response: any }> {
    const ref = referenceId || crypto.randomUUID();
    const host = callbackHost || this.config.callbackHost || 'staging.restopass.rw';
    const url = `${this.config.baseUrl}/v1_0/apiuser`;

    if (this.config.useMock) {
      this.mockStore.apiUsers.set(ref, { callbackHost: host });
      return { status: 201, referenceId: ref, response: { message: 'User created' } };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Reference-Id': ref,
        'Ocp-Apim-Subscription-Key': this.config.collectionSubscriptionKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ providerCallbackHost: host }),
    });

    const status = res.status;
    let response: any = {};
    try {
      response = await res.json();
    } catch {
      response = { statusText: res.statusText };
    }

    return { status, referenceId: ref, response };
  }

  // ============================================================================
  // Test Case 2: Sandbox User Provisioning - Create Api key
  // ============================================================================
  public async createApiKey(referenceId: string): Promise<{ status: number; apiKey: string; response: any }> {
    const url = `${this.config.baseUrl}/v1_0/apiuser/${referenceId}/apikey`;

    if (this.config.useMock) {
      const generatedKey = crypto.randomBytes(16).toString('hex');
      const user = this.mockStore.apiUsers.get(referenceId) || { callbackHost: 'staging.restopass.rw' };
      user.apiKey = generatedKey;
      this.mockStore.apiUsers.set(referenceId, user);
      this.config.apiUser = referenceId;
      this.config.apiKey = generatedKey;
      return { status: 201, apiKey: generatedKey, response: { apiKey: generatedKey } };
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Ocp-Apim-Subscription-Key': this.config.collectionSubscriptionKey!,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    const status = res.status;
    let apiKey = '';
    let response: any = {};
    try {
      response = await res.json();
      apiKey = response.apiKey || '';
      if (apiKey) {
        this.config.apiUser = referenceId;
        this.config.apiKey = apiKey;
      }
    } catch {
      response = { statusText: res.statusText };
    }

    return { status, apiKey, response };
  }

  // ============================================================================
  // Test Case 3: Collection Api - Token
  // ============================================================================
  public async getCollectionToken(apiUser?: string, apiKey?: string): Promise<{ status: number; tokenResponse: MomoTokenResponse }> {
    const user = apiUser || this.config.apiUser;
    const key = apiKey || this.config.apiKey;
    const subKey = this.config.collectionSubscriptionKey!;
    const url = `${this.config.baseUrl}/collection/token/`;

    if (this.config.useMock) {
      const mockToken: MomoTokenResponse = {
        access_token: `mock_coll_token_${crypto.randomBytes(24).toString('hex')}`,
        token_type: 'Bearer',
        expires_in: 3600,
      };
      this.tokenCache.set('collection', { token: mockToken.access_token, expiresAt: Date.now() + 3500 * 1000 });
      return { status: 200, tokenResponse: mockToken };
    }

    const basicAuth = Buffer.from(`${user}:${key}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Ocp-Apim-Subscription-Key': subKey,
      },
    });

    const status = res.status;
    const tokenResponse: MomoTokenResponse = await res.json();
    if (tokenResponse?.access_token) {
      this.tokenCache.set('collection', {
        token: tokenResponse.access_token,
        expiresAt: Date.now() + (tokenResponse.expires_in - 60) * 1000,
      });
    }

    return { status, tokenResponse };
  }

  // ============================================================================
  // Test Case 4: Collection Api - Debit Request / Request to Pay
  // ============================================================================
  public async requestToPay(params: RequestToPayParams): Promise<{ status: number; referenceId: string; response: any }> {
    const url = `${this.config.baseUrl}/collection/v1_0/requesttopay`;
    const currency = params.currency || this.config.defaultCurrency || 'EUR';

    if (this.config.useMock) {
      this.mockStore.requestsToPay.set(params.referenceId, {
        financialTransactionId: `${Math.floor(10000000 + Math.random() * 89999999)}`,
        externalId: params.externalId,
        amount: String(params.amount),
        currency,
        payer: {
          partyIdType: 'MSISDN',
          partyId: params.payerPhone.replace(/\D/g, ''),
        },
        status: 'SUCCESSFUL',
      });
      return { status: 202, referenceId: params.referenceId, response: { message: 'Accepted' } };
    }

    let token = this.tokenCache.get('collection')?.token;
    if (!token) {
      const t = await this.getCollectionToken();
      token = t.tokenResponse.access_token;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Reference-Id': params.referenceId,
        'X-Target-Environment': this.config.targetEnvironment!,
        'Ocp-Apim-Subscription-Key': this.config.collectionSubscriptionKey!,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: String(params.amount),
        currency,
        externalId: params.externalId,
        payer: {
          partyIdType: 'MSISDN',
          partyId: params.payerPhone.replace(/\D/g, ''),
        },
        payerMessage: params.payerMessage || 'RestoPass Meal Subscription',
        payeeNote: params.payeeNote || 'RestoPass Campus Cafeteria',
      }),
    });

    const status = res.status;
    let response: any = {};
    try {
      response = await res.json();
    } catch {
      response = { statusText: res.statusText };
    }

    return { status, referenceId: params.referenceId, response };
  }

  // ============================================================================
  // Test Case 5: Collection Api - Get Request to Pay Status
  // ============================================================================
  public async getRequestToPayStatus(referenceId: string): Promise<{ status: number; data: RequestToPayStatusResponse }> {
    const url = `${this.config.baseUrl}/collection/v1_0/requesttopay/${referenceId}`;

    if (this.config.useMock) {
      const found = this.mockStore.requestsToPay.get(referenceId);
      if (!found) {
        return {
          status: 404,
          data: {
            externalId: 'NOT_FOUND',
            amount: '0',
            currency: 'EUR',
            payer: { partyIdType: 'MSISDN', partyId: '' },
            status: 'FAILED',
            reason: 'Transaction not found',
          },
        };
      }
      return { status: 200, data: found };
    }

    let token = this.tokenCache.get('collection')?.token;
    if (!token) {
      const t = await this.getCollectionToken();
      token = t.tokenResponse.access_token;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Target-Environment': this.config.targetEnvironment!,
        'Ocp-Apim-Subscription-Key': this.config.collectionSubscriptionKey!,
        'Authorization': `Bearer ${token}`,
      },
    });

    const status = res.status;
    const data: RequestToPayStatusResponse = await res.json();
    return { status, data };
  }

  // ============================================================================
  // Test Case 6: Collection Api - Account Status Check
  // ============================================================================
  public async checkAccountActive(accountHolderId: string, accountHolderIdType = 'msisdn'): Promise<{ status: number; result: boolean; response: any }> {
    const cleanId = accountHolderId.replace(/\D/g, '');
    const url = `${this.config.baseUrl}/collection/v1_0/accountholder/${accountHolderIdType}/${cleanId}/active`;

    if (this.config.useMock) {
      const account = this.mockStore.accounts.get(cleanId);
      const isActive = account ? account.active : true;
      return { status: 200, result: isActive, response: { result: isActive } };
    }

    let token = this.tokenCache.get('collection')?.token;
    if (!token) {
      const t = await this.getCollectionToken();
      token = t.tokenResponse.access_token;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Target-Environment': this.config.targetEnvironment!,
        'Ocp-Apim-Subscription-Key': this.config.collectionSubscriptionKey!,
        'Authorization': `Bearer ${token}`,
      },
    });

    const status = res.status;
    let response: any = {};
    let result = false;
    try {
      response = await res.json();
      result = response.result === true || response.result === 'true';
    } catch {
      response = { statusText: res.statusText };
    }

    return { status, result, response };
  }

  // ============================================================================
  // Test Case 7: Collection Api - Account Balance Check
  // ============================================================================
  public async getCollectionBalance(): Promise<{ status: number; balance: any }> {
    const url = `${this.config.baseUrl}/collection/v1_0/account/balance`;

    if (this.config.useMock) {
      return {
        status: 200,
        balance: {
          availableBalance: '250000.00',
          currency: this.config.defaultCurrency || 'EUR',
        },
      };
    }

    let token = this.tokenCache.get('collection')?.token;
    if (!token) {
      const t = await this.getCollectionToken();
      token = t.tokenResponse.access_token;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Target-Environment': this.config.targetEnvironment!,
        'Ocp-Apim-Subscription-Key': this.config.collectionSubscriptionKey!,
        'Authorization': `Bearer ${token}`,
      },
    });

    const status = res.status;
    const balance = await res.json();
    return { status, balance };
  }

  // ============================================================================
  // Test Case 8: Disbursement Api - Token
  // ============================================================================
  public async getDisbursementToken(apiUser?: string, apiKey?: string): Promise<{ status: number; tokenResponse: MomoTokenResponse }> {
    const user = apiUser || this.config.apiUser;
    const key = apiKey || this.config.apiKey;
    const subKey = this.config.disbursementSubscriptionKey!;
    const url = `${this.config.baseUrl}/disbursement/token/`;

    if (this.config.useMock) {
      const mockToken: MomoTokenResponse = {
        access_token: `mock_disb_token_${crypto.randomBytes(24).toString('hex')}`,
        token_type: 'Bearer',
        expires_in: 3600,
      };
      this.tokenCache.set('disbursement', { token: mockToken.access_token, expiresAt: Date.now() + 3500 * 1000 });
      return { status: 200, tokenResponse: mockToken };
    }

    const basicAuth = Buffer.from(`${user}:${key}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Ocp-Apim-Subscription-Key': subKey,
      },
    });

    const status = res.status;
    const tokenResponse: MomoTokenResponse = await res.json();
    if (tokenResponse?.access_token) {
      this.tokenCache.set('disbursement', {
        token: tokenResponse.access_token,
        expiresAt: Date.now() + (tokenResponse.expires_in - 60) * 1000,
      });
    }

    return { status, tokenResponse };
  }

  // ============================================================================
  // Test Case 9: Disbursement Api - Transfer
  // ============================================================================
  public async disburseTransfer(params: TransferParams): Promise<{ status: number; referenceId: string; response: any }> {
    const url = `${this.config.baseUrl}/disbursement/v1_0/transfer`;
    const currency = params.currency || this.config.defaultCurrency || 'EUR';

    if (this.config.useMock) {
      this.mockStore.transfers.set(params.referenceId, {
        amount: String(params.amount),
        currency,
        financialTransactionId: `${Math.floor(20000000 + Math.random() * 89999999)}`,
        externalId: params.externalId,
        payee: { partyIdType: 'MSISDN', partyId: params.payeePhone.replace(/\D/g, '') },
        status: 'SUCCESSFUL',
      });
      return { status: 202, referenceId: params.referenceId, response: { message: 'Accepted' } };
    }

    let token = this.tokenCache.get('disbursement')?.token;
    if (!token) {
      const t = await this.getDisbursementToken();
      token = t.tokenResponse.access_token;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Reference-Id': params.referenceId,
        'X-Target-Environment': this.config.targetEnvironment!,
        'Ocp-Apim-Subscription-Key': this.config.disbursementSubscriptionKey!,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: String(params.amount),
        currency,
        externalId: params.externalId,
        payee: {
          partyIdType: 'MSISDN',
          partyId: params.payeePhone.replace(/\D/g, ''),
        },
        payerMessage: params.payerMessage || 'RestoPass Vendor Settlement',
        payeeNote: params.payeeNote || 'Settlement Payout',
      }),
    });

    const status = res.status;
    let response: any = {};
    try {
      response = await res.json();
    } catch {
      response = { statusText: res.statusText };
    }

    return { status, referenceId: params.referenceId, response };
  }

  // ============================================================================
  // Test Case 10: Disbursement Api - Account Balance Check
  // ============================================================================
  public async getDisbursementBalance(): Promise<{ status: number; balance: any }> {
    const url = `${this.config.baseUrl}/disbursement/v1_0/account/balance`;

    if (this.config.useMock) {
      return {
        status: 200,
        balance: {
          availableBalance: '850000.00',
          currency: this.config.defaultCurrency || 'EUR',
        },
      };
    }

    let token = this.tokenCache.get('disbursement')?.token;
    if (!token) {
      const t = await this.getDisbursementToken();
      token = t.tokenResponse.access_token;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Target-Environment': this.config.targetEnvironment!,
        'Ocp-Apim-Subscription-Key': this.config.disbursementSubscriptionKey!,
        'Authorization': `Bearer ${token}`,
      },
    });

    const status = res.status;
    const balance = await res.json();
    return { status, balance };
  }

  // ============================================================================
  // Test Case 11: Disbursement Api - Refund
  // ============================================================================
  public async refund(params: RefundParams): Promise<{ status: number; referenceId: string; response: any }> {
    const url = `${this.config.baseUrl}/disbursement/v2_0/refund`;
    const currency = params.currency || this.config.defaultCurrency || 'EUR';

    if (this.config.useMock) {
      this.mockStore.refunds.set(params.referenceId, {
        amount: String(params.amount),
        currency,
        financialTransactionId: `${Math.floor(30000000 + Math.random() * 89999999)}`,
        externalId: params.externalId,
        referenceIdToRefund: params.referenceIdToRefund,
        status: 'SUCCESSFUL',
      });
      return { status: 202, referenceId: params.referenceId, response: { message: 'Accepted' } };
    }

    let token = this.tokenCache.get('disbursement')?.token;
    if (!token) {
      const t = await this.getDisbursementToken();
      token = t.tokenResponse.access_token;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Reference-Id': params.referenceId,
        'X-Target-Environment': this.config.targetEnvironment!,
        'Ocp-Apim-Subscription-Key': this.config.disbursementSubscriptionKey!,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: String(params.amount),
        currency,
        externalId: params.externalId,
        referenceIdToRefund: params.referenceIdToRefund,
        payerMessage: params.payerMessage || 'RestoPass Refund',
        payeeNote: params.payeeNote || 'Reversal Credit',
      }),
    });

    const status = res.status;
    let response: any = {};
    try {
      response = await res.json();
    } catch {
      response = { statusText: res.statusText };
    }

    return { status, referenceId: params.referenceId, response };
  }

  // ============================================================================
  // Test Case 12: Disbursement Api - Get Refund Status
  // ============================================================================
  public async getRefundStatus(referenceId: string): Promise<{ status: number; data: any }> {
    const url = `${this.config.baseUrl}/disbursement/v1_0/refund/${referenceId}`;

    if (this.config.useMock) {
      const found = this.mockStore.refunds.get(referenceId);
      if (!found) {
        return { status: 404, data: { status: 'FAILED', reason: 'Refund not found' } };
      }
      return { status: 200, data: found };
    }

    let token = this.tokenCache.get('disbursement')?.token;
    if (!token) {
      const t = await this.getDisbursementToken();
      token = t.tokenResponse.access_token;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Target-Environment': this.config.targetEnvironment!,
        'Ocp-Apim-Subscription-Key': this.config.disbursementSubscriptionKey!,
        'Authorization': `Bearer ${token}`,
      },
    });

    const status = res.status;
    const data = await res.json();
    return { status, data };
  }

  // ============================================================================
  // Test Case 13: Disbursement Api - Get Api / Transfer Status
  // ============================================================================
  public async getTransferStatus(referenceId: string): Promise<{ status: number; data: any }> {
    const url = `${this.config.baseUrl}/disbursement/v1_0/transfer/${referenceId}`;

    if (this.config.useMock) {
      const found = this.mockStore.transfers.get(referenceId);
      if (!found) {
        return { status: 404, data: { status: 'FAILED', reason: 'Transfer not found' } };
      }
      return { status: 200, data: found };
    }

    let token = this.tokenCache.get('disbursement')?.token;
    if (!token) {
      const t = await this.getDisbursementToken();
      token = t.tokenResponse.access_token;
    }

    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'X-Target-Environment': this.config.targetEnvironment!,
        'Ocp-Apim-Subscription-Key': this.config.disbursementSubscriptionKey!,
        'Authorization': `Bearer ${token}`,
      },
    });

    const status = res.status;
    const data = await res.json();
    return { status, data };
  }

  // ============================================================================
  // Test Case 14: Remittance Api - Token
  // ============================================================================
  public async getRemittanceToken(apiUser?: string, apiKey?: string): Promise<{ status: number; tokenResponse: MomoTokenResponse }> {
    const user = apiUser || this.config.apiUser;
    const key = apiKey || this.config.apiKey;
    const subKey = this.config.remittanceSubscriptionKey!;
    const url = `${this.config.baseUrl}/remittance/token/`;

    if (this.config.useMock) {
      const mockToken: MomoTokenResponse = {
        access_token: `mock_remit_token_${crypto.randomBytes(24).toString('hex')}`,
        token_type: 'Bearer',
        expires_in: 3600,
      };
      this.tokenCache.set('remittance', { token: mockToken.access_token, expiresAt: Date.now() + 3500 * 1000 });
      return { status: 200, tokenResponse: mockToken };
    }

    const basicAuth = Buffer.from(`${user}:${key}`).toString('base64');
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${basicAuth}`,
        'Ocp-Apim-Subscription-Key': subKey,
      },
    });

    const status = res.status;
    const tokenResponse: MomoTokenResponse = await res.json();
    if (tokenResponse?.access_token) {
      this.tokenCache.set('remittance', {
        token: tokenResponse.access_token,
        expiresAt: Date.now() + (tokenResponse.expires_in - 60) * 1000,
      });
    }

    return { status, tokenResponse };
  }

  // ============================================================================
  // Test Case 15: Remittance Api - Transfer
  // ============================================================================
  public async remittanceTransfer(params: TransferParams): Promise<{ status: number; referenceId: string; response: any }> {
    const url = `${this.config.baseUrl}/remittance/v1_0/transfer`;
    const currency = params.currency || this.config.defaultCurrency || 'EUR';

    if (this.config.useMock) {
      return { status: 202, referenceId: params.referenceId, response: { message: 'Accepted' } };
    }

    let token = this.tokenCache.get('remittance')?.token;
    if (!token) {
      const t = await this.getRemittanceToken();
      token = t.tokenResponse.access_token;
    }

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'X-Reference-Id': params.referenceId,
        'X-Target-Environment': this.config.targetEnvironment!,
        'Ocp-Apim-Subscription-Key': this.config.remittanceSubscriptionKey!,
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        amount: String(params.amount),
        currency,
        externalId: params.externalId,
        payee: {
          partyIdType: 'MSISDN',
          partyId: params.payeePhone.replace(/\D/g, ''),
        },
        payerMessage: params.payerMessage || 'RestoPass Remittance',
        payeeNote: params.payeeNote || 'Cross-Border Ingestion',
      }),
    });

    const status = res.status;
    let response: any = {};
    try {
      response = await res.json();
    } catch {
      response = { statusText: res.statusText };
    }

    return { status, referenceId: params.referenceId, response };
  }

  // ============================================================================
  // Master Test Matrix Execution Harness (Runs all 15 Scenarios)
  // ============================================================================
  public async runFullSandboxTestMatrix(): Promise<TestCaseResult[]> {
    const results: TestCaseResult[] = [];
    const testUserRef = crypto.randomUUID();
    const testRequestToPayRef = crypto.randomUUID();
    const testTransferRef = crypto.randomUUID();
    const testRefundRef = crypto.randomUUID();
    const testRemitTransferRef = crypto.randomUUID();

    // 1. SandBox User Provisioning: Create Api User
    const t1Start = Date.now();
    const tc1 = await this.createApiUser(testUserRef);
    results.push({
      testCaseId: 1,
      scenarioTitle: 'SandBox User Provisioning',
      stepDescription: 'Create Api User',
      apiUrl: 'https://sandbox.momodeveloper.mtn.com/v1_0/apiuser',
      httpMethod: 'POST',
      expectedStatus: 201, // 201 or 202 per MTN spec
      actualStatus: tc1.status,
      apiResponse: tc1.response,
      result: [201, 202].includes(tc1.status) ? 'PASS' : 'FAIL',
      executionTimeMs: Date.now() - t1Start,
    });

    // 2. SandBox User Provisioning: Create Api key
    const t2Start = Date.now();
    const tc2 = await this.createApiKey(testUserRef);
    results.push({
      testCaseId: 2,
      scenarioTitle: 'SandBox User Provisioning',
      stepDescription: 'Create Api key',
      apiUrl: `https://sandbox.momodeveloper.mtn.com/v1_0/apiuser/${testUserRef}/apikey`,
      httpMethod: 'POST',
      expectedStatus: 201,
      actualStatus: tc2.status,
      apiResponse: tc2.response,
      result: [201, 200].includes(tc2.status) && !!tc2.apiKey ? 'PASS' : 'FAIL',
      executionTimeMs: Date.now() - t2Start,
    });

    // 3. Collection Api: Token
    const t3Start = Date.now();
    const tc3 = await this.getCollectionToken(testUserRef, tc2.apiKey);
    results.push({
      testCaseId: 3,
      scenarioTitle: 'Collection Api',
      stepDescription: 'Token',
      apiUrl: 'https://sandbox.momodeveloper.mtn.com/collection/token/',
      httpMethod: 'POST',
      expectedStatus: 200,
      actualStatus: tc3.status,
      apiResponse: { token_type: tc3.tokenResponse?.token_type, expires_in: tc3.tokenResponse?.expires_in },
      result: tc3.status === 200 && !!tc3.tokenResponse?.access_token ? 'PASS' : 'FAIL',
      executionTimeMs: Date.now() - t3Start,
    });

    // 4. Collection Api: Debit Request/ Request to pay
    const t4Start = Date.now();
    const tc4 = await this.requestToPay({
      referenceId: testRequestToPayRef,
      amount: '500',
      currency: this.config.defaultCurrency || 'EUR',
      externalId: `SUB-MOMO-${Date.now()}`,
      payerPhone: '250788123456',
      payerMessage: 'RestoPass Student Subscription',
      payeeNote: 'RestoPass Cafeteria',
    });
    results.push({
      testCaseId: 4,
      scenarioTitle: 'Collection Api',
      stepDescription: 'Debit Request/ Request to pay',
      apiUrl: 'https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay',
      httpMethod: 'POST',
      expectedStatus: 202,
      actualStatus: tc4.status,
      apiResponse: tc4.response,
      result: tc4.status === 202 ? 'PASS' : 'FAIL',
      executionTimeMs: Date.now() - t4Start,
    });

    // 5. Collection Api: Get Api/ Request to pay Status
    const t5Start = Date.now();
    const tc5 = await this.getRequestToPayStatus(testRequestToPayRef);
    results.push({
      testCaseId: 5,
      scenarioTitle: 'Collection Api',
      stepDescription: 'Get Api/ Request to pay Status',
      apiUrl: `https://sandbox.momodeveloper.mtn.com/collection/v1_0/requesttopay/${testRequestToPayRef}`,
      httpMethod: 'GET',
      expectedStatus: 200,
      actualStatus: tc5.status,
      apiResponse: tc5.data,
      result: tc5.status === 200 ? 'PASS' : 'FAIL',
      executionTimeMs: Date.now() - t5Start,
    });

    // 6. Collection Api: Account Status Check
    const t6Start = Date.now();
    const tc6 = await this.checkAccountActive('250788123456');
    results.push({
      testCaseId: 6,
      scenarioTitle: 'Collection Api',
      stepDescription: 'Account Status Check',
      apiUrl: 'https://sandbox.momodeveloper.mtn.com/collection/v1_0/accountholder/msisdn/250788123456/active',
      httpMethod: 'GET',
      expectedStatus: 200,
      actualStatus: tc6.status,
      apiResponse: tc6.response,
      result: tc6.status === 200 && tc6.result === true ? 'PASS' : 'FAIL',
      executionTimeMs: Date.now() - t6Start,
    });

    // 7. Collection Api: Account Balance Check
    const t7Start = Date.now();
    const tc7 = await this.getCollectionBalance();
    results.push({
      testCaseId: 7,
      scenarioTitle: 'Collection Api',
      stepDescription: 'Account Balance Check',
      apiUrl: 'https://sandbox.momodeveloper.mtn.com/collection/v1_0/account/balance',
      httpMethod: 'GET',
      expectedStatus: 200,
      actualStatus: tc7.status,
      apiResponse: tc7.balance,
      result: tc7.status === 200 ? 'PASS' : 'FAIL',
      executionTimeMs: Date.now() - t7Start,
    });

    // 8. Disbursement Api: Token
    const t8Start = Date.now();
    const tc8 = await this.getDisbursementToken(testUserRef, tc2.apiKey);
    results.push({
      testCaseId: 8,
      scenarioTitle: 'Disbursement Api',
      stepDescription: 'Token',
      apiUrl: 'https://sandbox.momodeveloper.mtn.com/disbursement/token/',
      httpMethod: 'POST',
      expectedStatus: 200,
      actualStatus: tc8.status,
      apiResponse: { token_type: tc8.tokenResponse?.token_type, expires_in: tc8.tokenResponse?.expires_in },
      result: tc8.status === 200 && !!tc8.tokenResponse?.access_token ? 'PASS' : 'FAIL',
      executionTimeMs: Date.now() - t8Start,
    });

    // 9. Disbursement Api: Transfer
    const t9Start = Date.now();
    const tc9 = await this.disburseTransfer({
      referenceId: testTransferRef,
      amount: '1000',
      currency: this.config.defaultCurrency || 'EUR',
      externalId: `TRX-DISB-${Date.now()}`,
      payeePhone: '250788000000',
      payerMessage: 'RestoPass Vendor Settlement',
      payeeNote: 'Settlement Payout',
    });
    results.push({
      testCaseId: 9,
      scenarioTitle: 'Disbursement Api',
      stepDescription: 'Transfer',
      apiUrl: 'https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/transfer',
      httpMethod: 'POST',
      expectedStatus: 202,
      actualStatus: tc9.status,
      apiResponse: tc9.response,
      result: tc9.status === 202 ? 'PASS' : 'FAIL',
      executionTimeMs: Date.now() - t9Start,
    });

    // 10. Disbursement Api: Account Balance Check
    const t10Start = Date.now();
    const tc10 = await this.getDisbursementBalance();
    results.push({
      testCaseId: 10,
      scenarioTitle: 'Disbursement Api',
      stepDescription: 'Account Balance Check',
      apiUrl: 'https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/account/balance',
      httpMethod: 'GET',
      expectedStatus: 200,
      actualStatus: tc10.status,
      apiResponse: tc10.balance,
      result: tc10.status === 200 ? 'PASS' : 'FAIL',
      executionTimeMs: Date.now() - t10Start,
    });

    // 11. Disbursement Api: Refund
    const t11Start = Date.now();
    const tc11 = await this.refund({
      referenceId: testRefundRef,
      amount: '500',
      currency: this.config.defaultCurrency || 'EUR',
      externalId: `REF-${Date.now()}`,
      referenceIdToRefund: testRequestToPayRef,
      payerMessage: 'Compensating Reversal',
      payeeNote: 'Meal Exception Credit',
    });
    results.push({
      testCaseId: 11,
      scenarioTitle: 'Disbursement Api',
      stepDescription: 'Refund',
      apiUrl: 'https://sandbox.momodeveloper.mtn.com/disbursement/v2_0/refund',
      httpMethod: 'POST',
      expectedStatus: 202,
      actualStatus: tc11.status,
      apiResponse: tc11.response,
      result: tc11.status === 202 ? 'PASS' : 'FAIL',
      executionTimeMs: Date.now() - t11Start,
    });

    // 12. Disbursement Api: Get Refund Status
    const t12Start = Date.now();
    const tc12 = await this.getRefundStatus(testRefundRef);
    results.push({
      testCaseId: 12,
      scenarioTitle: 'Disbursement Api',
      stepDescription: 'Get Refund Status',
      apiUrl: `https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/refund/${testRefundRef}`,
      httpMethod: 'GET',
      expectedStatus: 200,
      actualStatus: tc12.status,
      apiResponse: tc12.data,
      result: tc12.status === 200 ? 'PASS' : 'FAIL',
      executionTimeMs: Date.now() - t12Start,
    });

    // 13. Disbursement Api: Get Api/ Transfer Status
    const t13Start = Date.now();
    const tc13 = await this.getTransferStatus(testTransferRef);
    results.push({
      testCaseId: 13,
      scenarioTitle: 'Disbursement Api',
      stepDescription: 'Get Api/ Transfer Status',
      apiUrl: `https://sandbox.momodeveloper.mtn.com/disbursement/v1_0/transfer/${testTransferRef}`,
      httpMethod: 'GET',
      expectedStatus: 200,
      actualStatus: tc13.status,
      apiResponse: tc13.data,
      result: tc13.status === 200 ? 'PASS' : 'FAIL',
      executionTimeMs: Date.now() - t13Start,
    });

    // 14. Remittance Api: Token
    const t14Start = Date.now();
    const tc14 = await this.getRemittanceToken(testUserRef, tc2.apiKey);
    results.push({
      testCaseId: 14,
      scenarioTitle: 'Remittance Api',
      stepDescription: 'Token',
      apiUrl: 'https://sandbox.momodeveloper.mtn.com/remittance/token/',
      httpMethod: 'POST',
      expectedStatus: 200,
      actualStatus: tc14.status,
      apiResponse: { token_type: tc14.tokenResponse?.token_type, expires_in: tc14.tokenResponse?.expires_in },
      result: tc14.status === 200 && !!tc14.tokenResponse?.access_token ? 'PASS' : 'FAIL',
      executionTimeMs: Date.now() - t14Start,
    });

    // 15. Remittance Api: Transfer
    const t15Start = Date.now();
    const tc15 = await this.remittanceTransfer({
      referenceId: testRemitTransferRef,
      amount: '500',
      currency: this.config.defaultCurrency || 'EUR',
      externalId: `REMIT-${Date.now()}`,
      payeePhone: '250788000000',
      payerMessage: 'Campus Remittance',
      payeeNote: 'Cross-Border Ingestion',
    });
    results.push({
      testCaseId: 15,
      scenarioTitle: 'Remittance Api',
      stepDescription: 'Transfer',
      apiUrl: 'https://sandbox.momodeveloper.mtn.com/remittance/v1_0/transfer',
      httpMethod: 'POST',
      expectedStatus: 202,
      actualStatus: tc15.status,
      apiResponse: tc15.response,
      result: tc15.status === 202 ? 'PASS' : 'FAIL',
      executionTimeMs: Date.now() - t15Start,
    });

    return results;
  }
}

export const momoService = new MomoService();
