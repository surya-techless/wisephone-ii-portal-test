// AWS IoT Core Custom Authorizer for wiseOS device MQTT connections.
//
// Canonical/live source lives in the wiseos repo:
//   aws/lambda/wiseos-mqtt-authorizer/index.mjs
// This is a reference copy kept here because the change below (adding the
// `devices/{imei}/subscription` topic) is part of the MQTT subscription-status
// push feature this repo (the portal) publishes to — see
// docs/mqtt-subscription-status-plan.md, Part B, Step B1.
//
// IMPORTANT: editing this file does NOT deploy anything. There is no IaC or
// deploy script for this Lambda in either repo — it must be deployed manually
// (`aws lambda update-function-code --function-name wiseos-authorizer
// --zip-file fileb://...` or the AWS Console's inline editor) to the actual
// `wiseos-authorizer` Lambda in the AWS account. After deploying, this only
// governs NEW connections/token refreshes — devices with an already-issued
// authorizer token keep the old policy until `refreshAfterInSeconds` (12h)
// elapses or they reconnect.
//
// Keep this file and the wiseos repo's copy in sync — whichever one is edited
// first, port the same change to the other immediately to avoid drift between
// the two repos' record of what's actually deployed.
//
// Change from the previous deployed version: added `devices/{imei}/subscription`
// to both the iot:Subscribe and iot:Receive statements, alongside the existing
// `feature-flags` and `log/flush/.../ack` topics. This is additive only — it
// does not remove or narrow any existing grant, so devices on the old wiseOS
// app build (which never attempt to subscribe to the new topic) are unaffected.

export const handler = async (event, context) => {
  console.log('[Auth] Event received:', JSON.stringify(event, null, 2));

  const accountId = context.invokedFunctionArn.split(':')[4];
  const region = context.invokedFunctionArn.split(':')[3];

  const rawToken = event.protocolData?.mqtt?.password ?? '';
  const imei = Buffer.from(rawToken, 'base64').toString('utf8').trim();

  console.log(`[Auth] Decoded IMEI: ${imei}`);

  const isValidImei = /^\d{15}$/.test(imei);

  if (!isValidImei) {
    console.log(`[Auth] Rejected IMEI: ${imei} — invalid IMEI format`);

    return {
      isAuthenticated: false,
      principalId: 'unauthorized'
    };
  }

  console.log(`[Auth] Accepted IMEI: ${imei}`);

  return {
    isAuthenticated: true,
    principalId: imei,
    disconnectAfterInSeconds: 86400,
    refreshAfterInSeconds: 43200,
    policyDocuments: [
      {
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Action: ['iot:Connect'],
            Resource: [
              `arn:aws:iot:${region}:${accountId}:client/wiseos-${imei}`,
              `arn:aws:iot:${region}:${accountId}:client/wiseos-${imei}-logflush-pub*`,
              `arn:aws:iot:${region}:${accountId}:client/wiseos-${imei}-logflush-sub*`
            ]
          },
          {
            Effect: 'Allow',
            Action: ['iot:Subscribe'],
            Resource: [
              `arn:aws:iot:${region}:${accountId}:topicfilter/devices/${imei}/feature-flags`,
              `arn:aws:iot:${region}:${accountId}:topicfilter/log/flush/${imei}/ack`,
              `arn:aws:iot:${region}:${accountId}:topicfilter/devices/${imei}/subscription`
            ]
          },
          {
            Effect: 'Allow',
            Action: ['iot:Receive'],
            Resource: [
              `arn:aws:iot:${region}:${accountId}:topic/devices/${imei}/feature-flags`,
              `arn:aws:iot:${region}:${accountId}:topic/log/flush/${imei}/ack`,
              `arn:aws:iot:${region}:${accountId}:topic/devices/${imei}/subscription`
            ]
          }
        ]
      }
    ]
  };
};
