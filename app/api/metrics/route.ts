import { NextResponse } from "next/server";
import {
  CloudWatchClient,
  GetMetricStatisticsCommand,
} from "@aws-sdk/client-cloudwatch";

const client = new CloudWatchClient({
  region: process.env.AWS_REGION ?? "sa-east-1",
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

async function getMetric(metricName: string, days = 30): Promise<number> {
  const EndTime = new Date();
  const StartTime = new Date();
  StartTime.setDate(StartTime.getDate() - days);

  const cmd = new GetMetricStatisticsCommand({
    Namespace: "AWS/SES",
    MetricName: metricName,
    Dimensions: [{ Name: "campaign", Value: "airportpark" }],
    StartTime,
    EndTime,
    Period: 86400, // 1 dia por datapoint — CloudWatch não aceita mais que isso
    Statistics: ["Sum"],
  });

  try {
    const res = await client.send(cmd);
    // Soma todos os datapoints do período (um por dia)
    return res.Datapoints?.reduce((acc, dp) => acc + (dp.Sum ?? 0), 0) ?? 0;
  } catch {
    return 0;
  }
}

export const dynamic = "force-dynamic";

export async function GET() {
  const [sends, deliveries, opens, clicks, bounces, complaints] =
    await Promise.all([
      getMetric("Send"),
      getMetric("Delivery"),
      getMetric("Open"),
      getMetric("Click"),
      getMetric("Bounce"),
      getMetric("Complaint"),
    ]);

  const deliveryRate =
    sends > 0 ? ((deliveries / sends) * 100).toFixed(1) : "0.0";
  const openRate =
    deliveries > 0 ? ((opens / deliveries) * 100).toFixed(1) : "0.0";
  const clickRate =
    deliveries > 0 ? ((clicks / deliveries) * 100).toFixed(1) : "0.0";
  const bounceRate = sends > 0 ? ((bounces / sends) * 100).toFixed(2) : "0.00";
  const complaintRate =
    sends > 0 ? ((complaints / sends) * 100).toFixed(3) : "0.000";

  return NextResponse.json({
    sends,
    deliveries,
    opens,
    clicks,
    bounces,
    complaints,
    deliveryRate,
    openRate,
    clickRate,
    bounceRate,
    complaintRate,
  });
}
