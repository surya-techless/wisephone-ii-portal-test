// payload structure necessary to propagate metrics from AWS IoT to AWS CloudWatch
export function getSysprobeEMFPayload(awsNamespace: string) {
  const now = new Date().toISOString();

  return {
    awsSysprobeSignalReceivedAt: now,
    _aws: {
        CloudWatchMetrics: [
          {
            Namespace: awsNamespace,
            Dimensions: [[]],
            Metrics: [
              { Name: "Count", Unit: "Count" }
            ]
          }
        ]
      },
      "Count": 1
    }
};
