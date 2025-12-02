# 🤖 Token Activity Bot

An automated token trading bot for Base Network that runs entirely on GitHub Actions. No server required!

## 📋 Overview

This bot automatically:
- **Buys** a random amount ($1-$10) of a specified token every 30 minutes
- **Sells** all purchased tokens 15 minutes after each buy
- Runs 24/7 using GitHub Actions scheduled workflows
- Stores sensitive data securely in GitHub Secrets

## 🏗️ Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    GitHub Repository                         │
├─────────────────────────────────────────────────────────────┤
│  Secrets (encrypted):                                        │
│  - PRIVATE_KEY (wallet private key)                          │
│  - TOKEN_ADDRESS (token contract address)                    │
│  - RPC_URL (Base network RPC endpoint)                       │
├─────────────────────────────────────────────────────────────┤
│  GitHub Actions:                                             │
│  ┌─────────────┐    ┌─────────────┐                         │
│  │ buy.yml     │    │ sell.yml    │                         │
│  │ :00, :30    │    │ :15, :45    │                         │
│  └─────────────┘    └─────────────┘                         │
│         │                  │                                 │
│         ▼                  ▼                                 │
│  ┌─────────────────────────────────────────┐                │
│  │         Uniswap V3 on Base Network       │                │
│  └─────────────────────────────────────────┘                │
├─────────────────────────────────────────────────────────────┤
│  GitHub Pages: Static dashboard (optional)                   │
└─────────────────────────────────────────────────────────────┘
```

## 🚀 Quick Start

### Prerequisites

- A GitHub account
- A wallet with ETH on Base network (for gas + trading)
- The token contract address you want to trade

### Step 1: Fork/Clone Repository

```bash
# Clone the repository
git clone https://github.com/YOUR_USERNAME/token-activity-bot.git
cd token-activity-bot
```

### Step 2: Configure GitHub Secrets

Go to your repository's **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

Add these **required** secrets:

| Secret Name | Description | Example |
|-------------|-------------|---------|
| `PRIVATE_KEY` | Your wallet's private key (with 0x prefix) | `0x1234...abcd` |
| `TOKEN_ADDRESS` | The token contract address to trade | `0xabcd...1234` |
| `RPC_URL` | Base network RPC endpoint | `https://mainnet.base.org` |

### Step 3: Configure Variables (Optional)

Go to **Settings** → **Secrets and variables** → **Actions** → **Variables** tab

| Variable Name | Description | Default |
|---------------|-------------|---------|
| `SLIPPAGE_TOLERANCE` | Slippage tolerance in % | `5` |
| `MAX_GAS_PRICE` | Max gas price in Gwei | `50` |
| `BOT_ENABLED` | Set to `false` to disable | `true` |
| `NOTIFICATIONS_ENABLED` | Enable notifications | `false` |

### Step 4: Enable GitHub Actions

1. Go to **Actions** tab in your repository
2. Click **"I understand my workflows, go ahead and enable them"**
3. The bot will start running on schedule automatically

### Step 5: Enable GitHub Pages (Optional)

1. Go to **Settings** → **Pages**
2. Under "Build and deployment", select **GitHub Actions**
3. The dashboard will be available at `https://YOUR_USERNAME.github.io/token-activity-bot/`

## 📅 Schedule

| Action | Schedule | Description |
|--------|----------|-------------|
| **Buy** | `:00, :30` every hour | Buys random $1-$10 worth of tokens |
| **Sell** | `:15, :45` every hour | Sells all tokens (15 min after buy) |

**Example timeline:**
```
12:00 → BUY  $7.50 worth of tokens
12:15 → SELL all tokens
12:30 → BUY  $3.20 worth of tokens
12:45 → SELL all tokens
13:00 → BUY  $9.10 worth of tokens
...
```

## 🔒 Security

### What's Protected

- ✅ **Private key** stored in GitHub Secrets (encrypted at rest)
- ✅ **Secrets never exposed** in logs (automatically masked)
- ✅ **No server** - runs in isolated GitHub Actions environment
- ✅ **No database** - no persistent storage of sensitive data
- ✅ **Open source** - audit the code yourself

### Security Best Practices

1. **Use a dedicated wallet** - Never use your main wallet
2. **Fund minimally** - Only keep what you need for trading + gas
3. **Monitor regularly** - Check workflow runs and transactions
4. **Revoke if compromised** - Transfer funds immediately if suspicious activity

### ⚠️ Risks

- **Smart contract risk** - Uniswap V3 contracts could have vulnerabilities
- **Token risk** - The token you trade could lose value or be a scam
- **Slippage risk** - Low liquidity tokens may have high slippage
- **Gas spikes** - High gas prices could make trades unprofitable

## 🛠️ Local Development

### Setup

```bash
# Install dependencies
npm install

# Create .env file for local testing
cp .env.example .env
# Edit .env with your values
```

### Testing

```bash
# Validate configuration
npm run validate

# Dry run (simulates trades without executing)
npm run test

# Run buy action locally
npm run buy

# Run sell action locally
npm run sell
```

### Environment Variables

Create a `.env` file for local testing:

```env
PRIVATE_KEY=0x...
TOKEN_ADDRESS=0x...
RPC_URL=https://mainnet.base.org
SLIPPAGE_TOLERANCE=5
MAX_GAS_PRICE=50
```

## 📊 Monitoring

### GitHub Actions

- View workflow runs: **Actions** tab
- Each run shows detailed logs and summaries
- Failed runs are highlighted in red

### Transaction History

- View on [BaseScan](https://basescan.org)
- Search by your wallet address
- All transactions are on-chain and verifiable

### Logs

- Logs are uploaded as artifacts after each run
- Retained for 30 days
- Include correlation IDs for tracking

## 🔧 Customization

### Change Buy Amount Range

Edit `src/config/constants.js`:

```javascript
export const MIN_BUY_AMOUNT_USD = 1;  // Minimum $1
export const MAX_BUY_AMOUNT_USD = 10; // Maximum $10
```

### Change Schedule

Edit `.github/workflows/buy.yml` and `sell.yml`:

```yaml
schedule:
  - cron: '0,30 * * * *'  # Change cron expression
```

### Change Slippage

Set `SLIPPAGE_TOLERANCE` variable in GitHub or edit `src/config/constants.js`:

```javascript
export const SLIPPAGE_TOLERANCE_PERCENT = 5; // 5%
```

## 📁 Project Structure

```
token-activity-bot/
├── .github/
│   └── workflows/
│       ├── buy.yml           # Buy workflow
│       ├── sell.yml          # Sell workflow
│       └── deploy-pages.yml  # Dashboard deployment
├── docs/
│   └── index.html            # GitHub Pages dashboard
├── src/
│   ├── actions/
│   │   ├── buy.js            # Buy entry point
│   │   └── sell.js           # Sell entry point
│   ├── config/
│   │   └── constants.js      # Configuration constants
│   ├── services/
│   │   ├── blockchain.js     # Blockchain interactions
│   │   └── trading.js        # Trading logic
│   ├── test/
│   │   └── dry-run.js        # Dry run test
│   └── utils/
│       ├── logger.js         # Logging utility
│       ├── validation.js     # Input validation
│       └── validate-config.js # Config validator
├── package.json
└── README.md
```

## 🐛 Troubleshooting

### Common Issues

**"PRIVATE_KEY secret is not set"**
- Ensure you've added the secret in Settings → Secrets → Actions

**"Insufficient ETH balance"**
- Fund your wallet with more ETH on Base network

**"No liquidity found"**
- The token may not have a Uniswap V3 pool on Base
- Try a different token or check if liquidity exists

**"Gas price too high"**
- Increase `MAX_GAS_PRICE` variable
- Or wait for gas prices to decrease

**"Transaction reverted"**
- Increase `SLIPPAGE_TOLERANCE` for volatile tokens
- Check if the token has transfer restrictions

### Getting Help

1. Check the workflow logs in the Actions tab
2. Look for error codes in the logs
3. Search for the error message online
4. Open an issue with logs (redact sensitive info!)

## 📜 License

MIT License - Use at your own risk.

## ⚠️ Disclaimer

This software is provided "as is" without warranty of any kind. Trading cryptocurrencies involves significant risk. You could lose all your funds. Never trade with money you can't afford to lose. Always do your own research.

---

**Made with ❤️ for the DeFi community**
