import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	IHttpRequestOptions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { createWalletClient, http, type Chain } from 'viem';
import { HDKey, hdKeyToAccount } from 'viem/accounts';

import {
	mainnet,
	sepolia,
	base,
	baseSepolia,
	polygon,
	polygonMumbai,
	optimism,
	optimismSepolia,
	arbitrum,
	arbitrumSepolia,
	avalanche,
	avalancheFuji,
	bsc,
	bscTestnet,
} from 'viem/chains';

// Network name to Chain mapping
const NETWORK_MAP: Record<string, Chain> = {
	// Ethereum
	'ethereum': mainnet,
	'eth': mainnet,
	'mainnet': mainnet,
	'sepolia': sepolia,
	'eth-sepolia': sepolia,

	// Base
	'base': base,
	'base-mainnet': base,
	'base-sepolia': baseSepolia,

	// Polygon
	'polygon': polygon,
	'matic': polygon,
	'polygon-mainnet': polygon,
	'polygon-mumbai': polygonMumbai,
	'mumbai': polygonMumbai,

	// Optimism
	'optimism': optimism,
	'op': optimism,
	'op-mainnet': optimism,
	'optimism-sepolia': optimismSepolia,
	'op-sepolia': optimismSepolia,

	// Arbitrum
	'arbitrum': arbitrum,
	'arb': arbitrum,
	'arbitrum-one': arbitrum,
	'arbitrum-sepolia': arbitrumSepolia,
	'arb-sepolia': arbitrumSepolia,

	// Avalanche
	'avalanche': avalanche,
	'avax': avalanche,
	'avalanche-c': avalanche,
	'avalanche-fuji': avalancheFuji,
	'fuji': avalancheFuji,

	// BSC
	'bsc': bsc,
	'bnb': bsc,
	'binance': bsc,
	'bsc-mainnet': bsc,
	'bsc-testnet': bscTestnet,
	'bnb-testnet': bscTestnet,
};

interface X402Accept {
	scheme: string;
	network: string;
	maxAmountRequired: string;
	resource: string;
	description: string;
	mimeType: string;
	payTo: string;
	maxTimeoutSeconds: number;
	asset: string;
	extra?: {
		name?: string;
		version?: string;
		[key: string]: any;
	};
}

interface X402Response {
	x402Version: number;
	error: string;
	accepts: X402Accept[];
}

export class X402HttpRequest implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Zynd HTTP Request (x402)',
		name: 'zyndHttpRequestX402',
		icon: { light: 'file:../../icons/zynd.svg', dark: 'file:../../icons/zynd.svg' },
		group: ['transform'],
		version: 1,
		description: 'Make HTTP requests with automatic x402 payment handling',
		defaults: {
			name: 'HTTP Request (x402)',
			color: '#0088cc',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'web3wallet',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'URL',
				name: 'url',
				type: 'string',
				default: '',
				required: true,
				placeholder: 'https://api.example.com/endpoint',
				description: 'The URL to make the request to',
			},
			{
				displayName: 'Method',
				name: 'method',
				type: 'options',
				options: [
					{
						name: 'GET',
						value: 'GET',
					},
					{
						name: 'POST',
						value: 'POST',
					},
					{
						name: 'PUT',
						value: 'PUT',
					},
					{
						name: 'DELETE',
						value: 'DELETE',
					},
					{
						name: 'PATCH',
						value: 'PATCH',
					},
				],
				default: 'GET',
				description: 'The HTTP method to use',
			},
			{
				displayName: 'Send Body',
				name: 'sendBody',
				type: 'boolean',
				default: false,
				description: 'Whether to send a body with the request',
			},
			{
				displayName: 'Body Content Type',
				name: 'contentType',
				type: 'options',
				displayOptions: {
					show: {
						sendBody: [true],
					},
				},
				options: [
					{
						name: 'JSON',
						value: 'application/json',
					},
					{
						name: 'Form URL Encoded',
						value: 'application/x-www-form-urlencoded',
					},
					{
						name: 'Raw',
						value: 'text/plain',
					},
				],
				default: 'application/json',
			},
			{
				displayName: 'Body (JSON)',
				name: 'jsonBody',
				type: 'json',
				displayOptions: {
					show: {
						sendBody: [true],
						contentType: ['application/json'],
					},
				},
				default: '{}',
				description: 'Body in JSON format',
			},
			{
				displayName: 'Body (Raw)',
				name: 'rawBody',
				type: 'string',
				displayOptions: {
					show: {
						sendBody: [true],
						contentType: ['text/plain', 'application/x-www-form-urlencoded'],
					},
				},
				default: '',
				description: 'Raw body content',
			},
			{
				displayName: 'Send Headers',
				name: 'sendHeaders',
				type: 'boolean',
				default: false,
				description: 'Whether to send custom headers',
			},
			{
				displayName: 'Headers',
				name: 'headers',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				displayOptions: {
					show: {
						sendHeaders: [true],
					},
				},
				default: {},
				options: [
					{
						name: 'parameter',
						displayName: 'Header',
						values: [
							{
								displayName: 'Name',
								name: 'name',
								type: 'string',
								default: '',
							},
							{
								displayName: 'Value',
								name: 'value',
								type: 'string',
								default: '',
							},
						],
					},
				],
			},
			{
				displayName: 'Max Payment (USD)',
				name: 'maxPaymentUsd',
				type: 'number',
				default: 0.1,
				description: 'Maximum payment amount in USD to allow per request',
				typeOptions: {
					minValue: 0,
					numberPrecision: 2,
				},
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		// Get credentials
		const credentials = await this.getCredentials('web3wallet');
		const walletSeed = credentials.wallet_seed as string;
		const walletAddress = credentials.wallet_address as string;

		if (!walletSeed) {
			throw new NodeOperationError(this.getNode(), 'Wallet seed is required');
		}

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const url = this.getNodeParameter('url', itemIndex) as string;
				const method = this.getNodeParameter('method', itemIndex) as string;
				const sendBody = this.getNodeParameter('sendBody', itemIndex, false) as boolean;
				const sendHeaders = this.getNodeParameter('sendHeaders', itemIndex, false) as boolean;
				const maxPaymentUsd = this.getNodeParameter('maxPaymentUsd', itemIndex, 0.1) as number;

				// Build headers
				const headers: Record<string, string> = {
					'Content-Type': 'application/json',
				};

				if (sendHeaders) {
					const headerParams = this.getNodeParameter('headers.parameter', itemIndex, []) as Array<{
						name: string;
						value: string;
					}>;
					headerParams.forEach((header) => {
						if (header.name) {
							headers[header.name] = header.value;
						}
					});
				}

				// Build body
				let body: string | undefined;
				if (sendBody && ['POST', 'PUT', 'PATCH'].includes(method)) {
					const contentType = this.getNodeParameter('contentType', itemIndex) as string;
					headers['Content-Type'] = contentType;

					if (contentType === 'application/json') {
						const jsonBody = this.getNodeParameter('jsonBody', itemIndex, '{}') as string;
						body = typeof jsonBody === 'string' ? jsonBody : JSON.stringify(jsonBody);
					} else {
						body = this.getNodeParameter('rawBody', itemIndex, '') as string;
					}
				}

				// Make initial request
				const requestOptions: IHttpRequestOptions = {
					url,
					method: method as any,
					headers,
					body,
					returnFullResponse: true,
					ignoreHttpStatusErrors: true,
				};

				let response = await this.helpers.httpRequest(requestOptions);

				// Check for 402 Payment Required
				if (response.statusCode === 402) {
					const responseBody = response.body;

					if (!responseBody || !responseBody.accepts || !Array.isArray(responseBody.accepts)) {
						throw new NodeOperationError(
							this.getNode(),
							'Received 402 status but invalid x402 response format',
							{ itemIndex }
						);
					}

					const x402Data: X402Response = responseBody as X402Response;

					// Get the first payment option (you could add logic to select based on preferences)
					const paymentOption = x402Data.accepts[0];

					if (!paymentOption) {
						throw new NodeOperationError(
							this.getNode(),
							'No payment options available in x402 response',
							{ itemIndex }
						);
					}

					// Validate network support
					const networkName = paymentOption.network.toLowerCase();
					const chain = NETWORK_MAP[networkName];

					if (!chain) {
						const supportedNetworks = Object.keys(NETWORK_MAP).join(', ');
						throw new NodeOperationError(
							this.getNode(),
							`Network "${paymentOption.network}" is not supported. Supported networks: ${supportedNetworks}`,
							{ itemIndex }
						);
					}

					// Convert maxAmountRequired from base units (e.g., wei) to USD
					// Assuming USDC has 6 decimals
					const paymentAmountUsd = parseFloat(paymentOption.maxAmountRequired) / 1_000_000;

					// Validate payment amount against max cap
					if (paymentAmountUsd > maxPaymentUsd) {
						throw new NodeOperationError(
							this.getNode(),
							`Payment required ($${paymentAmountUsd.toFixed(6)}) exceeds maximum allowed ($${maxPaymentUsd})`,
							{ itemIndex }
						);
					}

					// Create wallet client with viem's default RPC
					const seed = Buffer.from(walletSeed, 'base64');
					const hdKey = HDKey.fromMasterSeed(seed);
					const account = hdKeyToAccount(hdKey);

					const walletClient = createWalletClient({
						account,
						chain,
						transport: http(), // viem will use the chain's default RPC URLs
					});

					// Generate nonce and deadline
					const nonce = Date.now();
					const deadline = Math.floor(Date.now() / 1000) + (paymentOption.maxTimeoutSeconds || 60);

					// Create EIP-712 signature
					const domain = {
						name: paymentOption.extra?.name || 'USDC',
						version: paymentOption.extra?.version || '2',
						chainId: chain.id,
						verifyingContract: paymentOption.asset as `0x${string}`,
					};

					const types = {
						Payment: [
							{ name: 'recipient', type: 'address' },
							{ name: 'amount', type: 'uint256' },
							{ name: 'nonce', type: 'uint256' },
							{ name: 'deadline', type: 'uint256' },
						],
					};

					const message = {
						recipient: paymentOption.payTo as `0x${string}`,
						amount: BigInt(paymentOption.maxAmountRequired),
						nonce: BigInt(nonce),
						deadline: BigInt(deadline),
					};

					const signature = await walletClient.signTypedData({
						account,
						domain,
						types,
						primaryType: 'Payment',
						message,
					});

					// Create X-PAYMENT header according to x402 spec
					const paymentHeader = JSON.stringify({
						version: x402Data.x402Version,
						scheme: paymentOption.scheme,
						signature,
						amount: paymentOption.maxAmountRequired,
						asset: paymentOption.asset,
						recipient: paymentOption.payTo,
						payer: walletAddress,
						nonce: nonce.toString(),
						deadline: deadline.toString(),
						network: paymentOption.network,
					});

					// Retry request with payment header
					const retryOptions: IHttpRequestOptions = {
						...requestOptions,
						headers: {
							...headers,
							'X-PAYMENT': paymentHeader,
						},
					};

					response = await this.helpers.httpRequest(retryOptions);

					// Add payment info to response
					returnData.push({
						json: {
							...response.body,
							_x402Payment: {
								amount: paymentAmountUsd.toFixed(6),
								amountRaw: paymentOption.maxAmountRequired,
								network: paymentOption.network,
								chainId: chain.id,
								asset: paymentOption.asset,
								assetName: paymentOption.extra?.name || 'USDC',
								recipient: paymentOption.payTo,
								payer: walletAddress,
								status: 'paid',
								signature: signature,
							},
						},
						pairedItem: { item: itemIndex },
					});
				} else {
					// Normal response without payment
					returnData.push({
						json: response.body,
						pairedItem: { item: itemIndex },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: error.message,
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}