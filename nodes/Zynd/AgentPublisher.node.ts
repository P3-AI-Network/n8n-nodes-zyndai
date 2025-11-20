import type {
    IExecuteFunctions,
    INodeExecutionData,
    INodeType,
    INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class AgentPublisher implements INodeType {
    description: INodeTypeDescription = {
        displayName: 'Zynd Agent Publisher',
        name: 'zyndAgentPublisher',
        icon: { light: 'file:zynd.svg', dark: 'file:zynd.dark.svg' },
        group: ['transform'],
        version: 1,
        description: 'Create and publish your n8n to the ZyndAI network',
        defaults: {
            name: 'Zynd Agent Publisher',
        },
        inputs: [NodeConnectionTypes.Main],
        outputs: [NodeConnectionTypes.Main],
        usableAsTool: true,
        credentials: [
            {
                name: 'zyndAiApi',
                required: true
            },
        ],
        properties: [],
    };

    async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
        const items = this.getInputData();
        const returnData: INodeExecutionData[] = [];


        const credentials = await this.getCredentials('zyndAiApi');
        const apiUrl = credentials.apiUrl as string;

        const n8nApiUrl = this.getInstanceBaseUrl();
        const workflowId = this.getWorkflow();

        // Process each input item
        for (let i = 0; i < items.length; i++) {
            try {

                // GET request workflow json
                const workflowResponse = await this.helpers.httpRequest({
                    method: 'GET',
                    url: `${n8nApiUrl}api/v1/workflows/${workflowId.id}`,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-N8N-API-KEY': credentials.n8nApiKey as string,
                    },
                    json: true,
                    timeout: 10000,
                    returnFullResponse: false,
                });

                const registerAgentResponse = await this.helpers.httpRequest({
                    method: 'POST',
                    url: `${apiUrl}/agents/n8n`,
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-API-KEY': credentials.apiKey as string
                    },
                    body: workflowResponse,
                    json: true,
                    timeout: 10000,
                    returnFullResponse: false,
                });

                const webHookId = workflowResponse.nodes.filter((node: any) => node.type === 'n8n-nodes-base.webhook')[0].webhookId;
                if (webHookId) {
                    const webhookUrl = `${n8nApiUrl}webhook/${webHookId}`;

                    await this.helpers.httpRequest({
                        method: 'POST',
                        url: `${apiUrl}/agents/update-n8n-webhook`,
                        headers: {
                            'Accept': 'application/json',
                            'Content-Type': 'application/json',
                            'X-API-KEY': credentials.apiKey as string
                        },
                        body: JSON.stringify({
                            "agentId": registerAgentResponse.id,
                            "n8nHttpWebhookUrl": webhookUrl,
                        }),
                        json: true,
                        timeout: 10000,
                        returnFullResponse: false,
                    });

                    this.logger.error(`Updated Webhook for Agent ID: ${registerAgentResponse.id}`);

                }

                returnData.push({
                    json: {
                        success: true,
                        agentId: registerAgentResponse.id,
                        agentDID: registerAgentResponse.didIdentifier,
                        message: 'Agent published successfully',
                    },
                    pairedItem: { item: i },
                });

            } catch (error) {
                // Handle errors gracefully
                if (this.continueOnFail()) {
                    returnData.push({
                        json: {
                            error: error.message || 'Unknown error occurred',
                            query: {
                                keyword: this.getNodeParameter('agentKeyword', i, ''),
                                capabilities: this.getNodeParameter('capabilities', i, []),
                            },
                            success: false,
                        },
                        pairedItem: { item: i },
                    });
                    continue;
                }
                throw error;
            }
        }

        this.logger.debug(`Returning data: ${JSON.stringify(returnData)}`);

        return [returnData];
    }
}