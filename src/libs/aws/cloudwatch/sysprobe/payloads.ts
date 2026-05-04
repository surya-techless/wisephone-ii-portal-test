import { hostname } from 'os';

// payload structure necessary to propagate metrics from AWS IoT to AWS CloudWatch
export function getSysprobeEMFPayload(awsMetricNamespace: string) {
  const environment: string = import.meta.env.ENVIRONMENT;
  return {
    _aws: {
        CloudWatchMetrics: [
          {
            Namespace: awsMetricNamespace,
            Dimensions: [
              ["Hostname"],
              ["Date"],
              ["Environment"]
            ],
            Metrics: [
              { Name: "Count", Unit: "Count" },
            ]
          }
        ]
      },
      Count: 1,
      Hostname: hostname(),
      Environment: environment,
      Date: new Date().toISOString().slice(0, 10)  // seems naive to me but apparently the Date API has no native `format` method to get the YYY-mm-dd format
    }
};
