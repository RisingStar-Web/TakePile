// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const { ethers } = require("hardhat");
const hre = require("hardhat");
const fs = require('fs');

async function main() {
  await hre.run("compile");

  const [owner] = await ethers.getSigners();
  const [ownerAddr] = await Promise.all([owner].map((x) => x.getAddress()));

  console.log(`Deployer Address: ${ownerAddr}`);

  const treasuryAddr = '0x1B4E80C6A4Ab6Aab3B945B1A2205F8399880f832';

  const TestToken = await ethers.getContractFactory("TestToken");
  const usdc = await TestToken.deploy(
    "USD Coin",
    "USDC",
    ethers.utils.parseUnits("100000000", 18).toString()
  );
  await usdc.deployed();
  console.log("USDC:", usdc.address);

  const LiquidationPass = await ethers.getContractFactory("LiquidationPass");
  liquidationPass = await LiquidationPass.deploy("https://testnet.takepile.com/liquidation-pass.gif");
  await liquidationPass.deployed();

  const take = await TestToken.deploy("Takepile", "TAKE", ethers.utils.parseUnits("100000000", 18).toString());
  await take.deployed();
  console.log("TAKE", take.address);

  const decimals = await usdc.decimals();
  const TakePresale = await ethers.getContractFactory("TakePresale");
  const presaleRound1 = await TakePresale.deploy(
    ethers.utils.parseUnits('.5', decimals),
    ethers.utils.parseUnits('3000', 18),
    usdc.address,
    take.address
  );
  await presaleRound1.deployed();
  console.log("Presale Round 1:", presaleRound1.address);

  const presaleRound2 = await TakePresale.deploy(
    ethers.utils.parseUnits('.75', decimals),
    ethers.utils.parseUnits('3000', 18),
    usdc.address,
    take.address
  );
  await presaleRound2.deployed();
  console.log("Presale Round 2:", presaleRound2.address);

  const ChainlinkPriceConsumer = await ethers.getContractFactory("ChainlinkPriceConsumer");
  const priceConsumer = await ChainlinkPriceConsumer.deploy();
  await priceConsumer.deployed();
  console.log("ChainlinkPriceConsumer:", priceConsumer.address);

  const TakepileFactory = await ethers.getContractFactory("TakepileFactory");
  const takepileFactory = await TakepileFactory.deploy();
  await takepileFactory.deployed();
  console.log("TakepileFactory:", takepileFactory.address);

  const XTakeFactory = await ethers.getContractFactory("xTakeFactory");
  const xTakeFactory = await XTakeFactory.deploy();
  await takepileFactory.deployed();
  console.log("xTakeFactory:", xTakeFactory.address);

  const TakepileDriver = await ethers.getContractFactory("TakepileDriver");
  const driver = await TakepileDriver.deploy(
    take.address,
    takepileFactory.address,
    xTakeFactory.address,
    treasuryAddr,
    liquidationPass.address
  );
  await driver.deployed();
  console.log("Driver:", driver.address);


  // Transfer takepileFactory ownership to driver
  console.log('Transfering factory ownership to driver');
  await takepileFactory.transferOwnership(driver.address);

  // Transfer 75% of TAKE supply to driver for emissions
  console.log('Transfering TAKE to driver');
  await take.transfer(
    driver.address,
    ethers.utils.parseUnits("75000000", 18).toString()
  );

  fs.writeFileSync('deployment.json', JSON.stringify({
    treasury: treasuryAddr,
    USDC: usdc.address,
    TAKE: take.address,
    presaleRound1: presaleRound1.address,
    presaleRound2: presaleRound2.address,
    liquidationPass: liquidationPass.address,
    priceConsumer: priceConsumer.address,
    takepileFactor: takepileFactory.address,
    xTakeFactory: xTakeFactory.address,
    takepileDriver: driver.address,
  }, null, 2))


}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
