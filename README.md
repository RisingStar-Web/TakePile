# Takepile Contracts

## Hardhat scripts

```shell
npx hardhat accounts
npx hardhat compile
npx hardhat clean
npx hardhat test
npx hardhat node
npx hardhat help
REPORT_GAS=true npx hardhat test
npx hardhat coverage
npx hardhat run scripts/deploy.js
node scripts/deploy.js
npx eslint '**/*.js'
npx eslint '**/*.js' --fix
npx prettier '**/*.{json,sol,md}' --check
npx prettier '**/*.{json,sol,md}' --write
npx solhint 'contracts/**/*.sol'
npx solhint 'contracts/**/*.sol' --fix
```

## Etherscan verification

To try out Etherscan verification, you first need to deploy a contract to an Ethereum network that's supported by Etherscan, such as Ropsten.

In this project, copy the .env.example file to a file named .env, and then edit it to fill in the details. Enter your Etherscan API key, your Ropsten node URL (eg from Alchemy), and the private key of the account which will send the deployment transaction. With a valid .env file in place, first deploy your contract:

```shell
hardhat run --network ropsten scripts/deploy.js
```

Then, copy the deployment address and paste it in to replace `DEPLOYED_CONTRACT_ADDRESS` in this command:

```shell
npx hardhat verify --network ropsten DEPLOYED_CONTRACT_ADDRESS "Hello, Hardhat!"
```


### Deployment

5/23 Mainnet Deployment

```
Deployer Address: 0xAF48C210B0842cAc305376c24433a61fB7Dec6ef
USDC: 0x04068DA6C83AFCFA0e13ba15A6696662335D5B75
TAKE 0xE9e5a97aCc59BB68813bF368487fBFfd0a39713b
Presale Round 1: 0x869189056274Db20A4f4aC75BC7e15BC04854246
Presale Round 2: 0xE895F3083eDf36B1F3346458602ef759832F69f2
Transferring Presale Round 1 ownership to Treasury
Transferring Presale Round 2 ownership to Treasury
Transfering 9360000 TAKE to treasury
```


4/14/2022

Deployer: 0x8c770868323e6ED2360Dc800585cb1254647c476

```
TestToken: 0xB0eCef760887D87D8160d187a75cE93E58CDCEe7
TAKE 0xf7d9A8f5E8404471772F6B404033Fb54469571bb
TakepileFactory: 0xCe3Bbd47113e2cD62Ada04429D8b39Cdb3F8Da0c
xTakeFactory: 0xC111162eD59eb27c3d201272C5ba60C45a2Fb085
Driver: 0xB3913a5782ac4cFb50b70c340b9164312b9F81F6
pileToken 0x76DBC0874E12fea2859B29917D76A0b78f00e09a
MockPriceConsumer: 0x87684eb12c7C2D5621F7D3e9eE9ba3d698AC7355
```

Deployed 4/27:

ChainlinkPriceConsumer: 0xbf61F73973Df5E85b7142aaaB4c4Bdd2Ea8C574b


### Technical Notes

#### PriceConsumer

Initially we will use Chainlink Oracles for real-time market price data. However in theory we can use any other oracle that's available.
#### TakepileToken

- Main contract that users will interface with
- Basic trading:
  - `placeMarketIncrease`
  - `placeMarketDecrease`
- Liquidation:
  - `getHealthFactor`
  - `liquidate`
- Limit Orders:
  - `placeLimitIncrease`
  - `placeLimitDecrease`
  - `triggerLimitOrder`

All trading methods call internal methods `increasePosition` or `decreasePosition`.
#### TAKE

- TAKE will be distributed via simple interest rate emissions on open positions, according to the Takepile's distribution rate (managed by governance)

#### TakepileDriver

- Responsible for creating new Takepiles, validation layer, and TAKE emissions
- Will distribute TAKE according to Takepile's distribution rate until the Driver's TAKE balance is exhausted
- Will also distribute TAKE to Vault stakers until Driver's Take balance is exhausted
#### xTAKE (fee distributor)

Every individual Takepile will have it's own "Distributor" contract responsible for distributing a portion of Takepile fees to stakers who have staked their TAKE on the Takepile.

For example, users deposit TAKE into the USDT Takepile Distributor in  exchange for `xTAKE (USDT)`.

The Distributor contract is an ERC20 contract with four main external methods:

1. stake: stake TAKE in exchange for the pile's xTAKE
2. unstake: burn xTAKE to get staked TAKE back
3. claimable: get the current claimable amount
4. claim: collect fees accrued on your stake

When a position is opened on the Takepile, the Takepile contract will call the internal `distribute` function which transfers pileToken from the Takepile to the distributor. The distributor makes sure balances are reconciled before any claims and transfers (including mint and burn) to ensure accurate accounting.

To reduce rounding errors, a "pointMultiplier" is used. There may still be some left over funds that get stuck in the contract -- this is something to review further.

#### Vault

To incentivize people to add TAKE to liquidity pools, we want to offer additional TAKE rewards if they lock up their LP tokens with us for a certain period of time.

The `TakepileDriver` is responsible for `TAKE` emissions. Upon closing a position, the `TakepileToken` contract calls the driver's `distributeTakeFromTakepile` method, and the TAKE rewards are sent to the user.

`Vault` emissions work in a similar way. Whenever a user claims their accrued rewards for their stake, the `Vault` contract calls the drivers `distributeTakeFromVault` method with the stake amount and lockup period. The `Driver` calculate the rate for this lockup period, calculates the distribution using that rate, and the TAKE rewards are sent to the user.

There will be different rates for each lockup period:

- No lockup: rate 0
- >= 30 day lockup: rate 1
- >= 180 day lockup: rate 2
- >= 365 day lockup: rate 3

A stake with no lockup period can be withdrawn at any time. A stake with a lockup period cannot be unstaked until the lockup period has surpassed.

If there is an available claim when someone tries to unstake, the protocol will autoclaim the reward for them. (so not required to claim before unstake).


#### Limit Orders

Place Market Increase (who, symbol, amount, isLong)
- Transfer `amount` of pile token from who to Takepile
- Get current price for `symbol`
- If position for this symbol already exists:
  - Fail if conflicting `isLong` directions
  - Create position at entry price with `position.amount = amount - entry fees`
- Otherwise:
  - Add `amount - entry fees` to existing position and update entry price

Place Market Decrease (who, symbol, amount, isLong)
- Fail if position does not exist
- If `amount` greater than `position.amount`, set `amount` to `position.amount`
- Compute `exit amount = amount - exit fees`
- Get current price for `symbol` to use as exit price
- Compute `reward = amount * (% gain/loss in position)`
- Transfer `exit amount` to `who`
- Mint/burn reward (mint if reward positive, burn if reward negative)

Place Limit Increase (who, symbol, amount, isLong, limitPrice)
- Fail if existing position exists and does not match `isLong` direction
- Transfer `amount` from who to Takepile, and store on users "limit balance"
- Create increase limit order and wait for trigger

Place Limit Decrease (who, symbol, stopLoss, takeProfit)
- Fail if position does not exist
- Fail if order would trigger immediately
- Create decrease limit order and wait for trigger

Cancel limit order (who, symbol)
- Fail if order does not exist
- If order would've opened position, transfer amount from Takepile to who, and decrement users "limit balance"
- Set limit order to inactive

Trigger Limit Order (who, symbol)
- Fail if order does not exist or is inactive
- Fail if price conditions not satisfied
- If order opens position:
  - Take fees from user's "temp balance" (user already transferred funds on limit order creation)
  - Create position
- If order closes position:
  - Follow same logic as "Exit Position":
  - Transfers `position.amount - exit fees` pile token from Takepile to who
  - Mints or burns pileToken for who depending on result of trade
  - Delete position
- Transfers trigger fees to the trigger
- Set limit order to inactive


### Leverage

- Every position will have a size, and a collateral amount
- Resulting leverage is total position size divided by collateral amount.


#### Idealized Examples:

Position: Size 1000, Collateral 100 @ $100
Current price: 90
Scale: 100

Leverage = size / collateral = 10x
Factor = (entryPrice - exitPrice) * scaleFactor * leverage / entryPrice
       = (100 - 90) * 100 * 10 / 100
       = 100

Liquidatable if Factor > scale

Say current price is 110, a 10% gain
How much will leveraged user receive if the exit position?

Reward = (position.size * 1.1) - position.size;
Position size 1000 --> 1100
Reward = 1100 - 1000 = 100

Should receive back collateral + reward 
= 100 + 100 = 200

Say current price is 95, a 5% loss
How much will leveraged user receive if the exit position?

Reward = (position.size * exitPrice / entryPrice ) - position.size;
Reward = (95 / 100 * 1000) - 1000 = -50

Should receive back collateral + reward
= 100 - 50 = 50

#### Another example

Position size: 25000
Collateral: 1000

Leverage = size / collateral
         = 25

Entry price: 100
Exit price: 99

Health Factor = ((entryPrice-exitPrice)/entryPrice)*10
If > 1 --> liquidatable

Get back = (25000 * 99 / 100) - 25000 + 1000
         = 750




### Optimizations

- TakepileFactory is the biggest contract, almost reaching the 24kb limit
- Including `Ownable` on TakepileFactory and restricting Takepile creation to owner adds 0.567 kb
  - This is not necessarily a bad thing to allow anyone to create a takepile
  - Only those created by the TakepileDriver will emit creation events (and that method is protected) so there might not be much harm in allowing it to be open; same goes for xTake and the xTakeFactory


### Random questions

- Are fees lost on cancelled limit orders? No. Fees are only taken on position entry.
- Will liquidated positions receive TAKE distribution? No.
- Will increaseing and decreasing market positions manually cancel limit orders? No.


### TODO

- Make minimum withdraw time adjustable in Takepile config

