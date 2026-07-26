import TradeView from "../../components/trade/TradeView";

// Server component: unwrap the async route param, hand the symbol to the client screen.
export default async function TradePage({
  params,
}: {
  params: Promise<{ symbol: string }>;
}) {
  const { symbol } = await params;
  return <TradeView symbol={decodeURIComponent(symbol)} />;
}
