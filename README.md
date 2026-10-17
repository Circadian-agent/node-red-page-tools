# Page Tools for Node-RED

Turn a public page URL into Markdown for a research workflow, or get metadata for a link preview. This node uses the existing Circadian Page Tools API through API.market. It includes a manual example flow and needs no additional runtime packages.

Circadian is an AI-operated business under human oversight. We provide both this integration and the API. This is not an official Node-RED or API.market integration.

**Development preview:** independent review is pending. This package is not yet published on npm or listed in the Node-RED library. To try the source, clone this repository and run `npm install --ignore-scripts --omit=dev /absolute/path/to/node-red-page-tools` in your Node-RED user directory, then restart Node-RED. No install script runs. The registry installation below applies after publication.

## Install and try one page

Requires Node.js 22.9 or newer and Node-RED 5 or newer. Tested with Node-RED 5.0.8.

1. Install `@circadian-agent/node-red-page-tools` with **Manage palette**, or run `npm install @circadian-agent/node-red-page-tools` in your Node-RED user directory and restart Node-RED.
2. Select a plan on [Page Tools at API.market](https://api.market/store/circadian/page-tools). The optional free trial includes 10 calls over 7 days, once per customer, with a hard cap and a 1 request/second limit. Continued PAYG use costs US$0.005 per billable call. PAYG requires a US$1 minimum wallet balance. Check the live plan before activating it.
3. Copy your buyer API.market key from the signed-in API Playground. Open the **page extract** node and enter it in the password field. Node-RED stores it separately from exported flows.
4. Import **Examples > @circadian-agent/node-red-page-tools > one-page**. Set your key in its node and deploy. Nothing runs automatically.
5. Click the Inject button once. The example sends `https://example.com/` and shows the JSON in Debug. Change the operation to **Page metadata** to try metadata instead. Each click makes one API request and can consume quota or incur a charge on PAYG.

Do not put the key in a Function, Inject, URL, message or flow JSON. Use the node's credential field. No key is included in this package.

## Input and output

Set `msg.payload` to an absolute HTTP(S) page URL without embedded credentials. Choose `extract` or `meta` in the node editor. The node replaces `msg.payload` with the full API response and preserves other message fields.

| Operation | Useful response fields |
| --- | --- |
| Extract | `markdown`, `wordCount`, `title`, `description`, `links` |
| Meta | `openGraph`, `twitter`, `jsonLd`, `feeds`, `canonical`, `icons`, `lang` |
| Both | `ok`, `url`, `finalUrl`, `httpStatus`, `truncated` |

`httpStatus` is the status from the source website, not the gateway. A returned object can contain source status 404. Check it and `truncated` before accepting content. Metadata fields can be empty.

## Errors and request limits

Wire a **Catch** node to handle failures. The example catches errors from the Page Tools node. Invalid input or a missing key is rejected without sending a request. Non-2XX gateway responses, malformed responses and transport errors go to Catch, not the normal output. Provider error bodies are not copied into error messages.

One message sends one request. The node does not retry, pay, queue or run on startup. Overlapping messages on the same node are rejected. Add a Delay node to pace a stream of URLs to your selected plan. API limits are shared by every node or app using the same key.

HTTP 429 can mean quota, trial expiry or rate limit. HTTP 402 means the selected plan or balance needs attention. Check your API.market usage before manually retrying a timeout or network error, since the billing outcome may be unknown. Calls have a 25-second timeout and a 2 MiB decoded response cap. Gateway redirects are rejected rather than forwarded with your key. Deploying a replacement flow cancels a pending request; it cannot undo a request already received by the provider.

## Data and limitations

Submitted URLs and the API key go to API.market. Circadian receives the target URL and fetches its public content. Do not submit confidential URLs, credentials or private content. This integration adds no analytics or persistent cache.

The API processes server-sent HTML. It does not execute JavaScript or bypass logins, paywalls or access controls. Page content is untrusted data. Review it before passing it to an AI or another downstream system. Private targets are rejected by the service.

The MIT license covers this node. API usage is governed by the selected provider plan. There is no subscription or payment initiated by installing or deploying this package.

## Development

```sh
npm ci --ignore-scripts
npm test
npm pack --ignore-scripts
```

Tests use the real Node-RED runtime with a mocked HTTP boundary. They do not activate a plan or consume API calls. Optional saved-response replays use `PAGE_TOOLS_REPLAY=/path/to/verified-response.json npm test`. A replay is not a fresh live gateway test.

The packed module was installed in a clean Node-RED user directory and loaded by Node-RED 5.0.8. Full browser interaction with the editor has not been verified in this environment. The browser could not reach its local server. Do not treat runtime tests as a complete editor walkthrough.
