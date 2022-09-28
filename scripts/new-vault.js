// We require the Hardhat Runtime Environment explicitly here. This is optional
// but useful for running the script in a standalone fashion through `node <script>`.
//
// When running the script with `npx hardhat run <script>` you'll find the Hardhat
// Runtime Environment's members available in the global scope.
const { ethers } = require("hardhat");
const hre = require("hardhat");

const deployment = require("./testnet-deployment.json");

async function main() {
  await hre.run("compile");

  const [owner] = await ethers.getSigners();
  const [ownerAddr] = await Promise.all([owner].map((x) => x.getAddress()));

  const driver = await ethers.getContractAt("TakepileDriver", deployment.takepileDriver);
  console.log(`driver`, driver.address);

  // const creationTx = await driver.createVault(deployment.USDC, {
  //   gasLimit: 8000000,
  // });
  // await creationTx.wait();

  // NOTE: make sure pointing to right one
  const vault = await ethers.getContractAt("Vault", await driver.vaults(0));
  console.log(`Vault Address`, vault.address);

  await driver.setVaultDistributionRates(
    vault.address, 
    "1585489599188229600", // 1e27*0.05/(365*24*60*60)
    "3170979198376459300",
    "4756468797564688000",
    "6341958396752919000"
  );

  console.log(`Set distribution rate`);


}

// We recommend this pattern to be able to use async/await everywhere
// and properly handle errors.
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
