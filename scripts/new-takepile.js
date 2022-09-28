// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const { ethers } = require("hardhat");
const hre = require("hardhat");

const deployment = require("./deployment.json");

async function main() {
  await hre.run("compile");

  const [owner] = await ethers.getSigners();
  const [ownerAddr] = await Promise.all([owner].map((x) => x.getAddress()));

  const driver = await ethers.getContractAt("TakepileDriver", deployment.takepileDriver);
  console.log(`driver`, driver.address);

  // const creationTx = await driver.createTakepile(deployment.USDC, "USDC Pile", "pileUSDC", 1, {
  //   gasLimit: 8000000,
  // });
  // await creationTx.wait();

  // NOTE: make sure pointing to right one
  const pileToken = await ethers.getContractAt("TakepileToken", await driver.takepiles(0));
  console.log(`Takepile Address`, pileToken.address);

  tx = await pileToken.addMarket(
    "BTCUSD",
    deployment.priceConsumer, // chainlink price consumer
    "0x65E8d79f3e8e36fE48eC31A2ae935e92F5bBF529" // should be chainlink price feed
  );
  await tx.wait();
  console.log("Added BTCUSD market");

  tx = await pileToken.addMarket(
    "ETHUSD",
    deployment.priceConsumer,
    "0xB8C458C957a6e6ca7Cc53eD95bEA548c52AFaA24"
  );
  await tx.wait();
  console.log("Added ETHUSD market");

  tx = await pileToken.addMarket(
    "LINKUSD",
    deployment.priceConsumer,
    "0x6d5689Ad4C1806D1BA0c70Ab95ebe0Da6B204fC5"
  );
  await tx.wait();
  console.log("Added LINKUSD market");

  await driver.setTakepileDistributionRate(pileToken.address, 
    "1585489599188229400"
  );

  console.log(`Set distribution rate`);

  await driver.setTakepileFeeDivisors(
    pileToken.address,
    4000, // burnFee 0.025%
    2000, // treasuryFee 0.05%
    4000, // distributionFee 0.025%
    2000 // limitFee 0.05%
  );

  console.log(`Set fee divisors`);

  await driver.setTakepileLiquidationRewardDivisor(
    pileToken.address,
    10 // 10%
  );

  console.log(`Set liquidation reward divisor`);

  await driver.setTakepileAmountParameters(
    pileToken.address,
    10, // max position 10% of total supply
    "1000000000000000000", // min position 1 test token
    {
      gasLimit: 5000000,
    }
  );

  console.log(`Set takepile amount parameters`);

  await driver.setTakepileMinimumDuration(pileToken.address, 60 * 15, {
    gasLimit: 5000000,
  }); // 15 minute minimum position duration

  console.log(`Set takepile minimum position duration`);
}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
