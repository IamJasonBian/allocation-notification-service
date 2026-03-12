/**
 * Sector tags applied to all jobs from companies in these sets.
 * These are merged into each job's tag set during diffAndUpdate.
 */
export const SECTOR_TAGS: Record<string, Set<string>> = {
  finance: new Set([
    // Fintech & Payments
    "stripe", "affirm", "marqeta", "melio", "alloy", "ramp", "mercury",
    "greenlight", "brex", "coinbase", "moderntreasury",
    // Buy-side: PE / Growth Equity / Hedge Funds
    "generalatlantic", "gcmgrosvenor", "vikingglobalinvestors", "gtcr",
    "a16z", "schonfeld", "exoduspoint", "apollo", "warburgpincusllc",
    // Sell-side: IB / Equity Research
    "williamblair", "seaportglobal", "aerispartners.com",
    // Quant / Trading
    "aquaticcapitalmanagement", "gravitonresearchcapital", "janestreet",
    "oldmissioncapital", "imc", "jumptrading", "aqr", "towerresearchcapital",
    "mangroup", "virtu",
    // NYC Fintech
    "plaid", "paxos", "socure", "persona", "lemonade", "column", "novo",
    "lithic", "betterment", "blend", "chime", "sofi", "adyen", "carta",
    "payoneer", "billcom", "toast", "earnin", "n26", "justworks", "forter",
    "nubank", "iex", "nerdwallet", "unit", "olo", "compasslexecon",
    // Crypto / Blockchain
    "galaxydigitalservices", "blockchain", "ripple", "gemini", "bitgo",
    "aptoslabs", "opensea", "uniswap", "paradigm", "fireblocks", "alchemy",
    "consensys", "dune",
    // Other fintech-adjacent
    "abound", "clearco", "glow", "causal", "rutter", "finch",
  ]),
};

export function getCompanySectors(boardToken: string): string[] {
  return Object.entries(SECTOR_TAGS)
    .filter(([, tokens]) => tokens.has(boardToken))
    .map(([sector]) => sector);
}
