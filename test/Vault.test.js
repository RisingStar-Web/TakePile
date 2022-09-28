const { expect } = require("chai");
const { ethers } = require("hardhat");
const { utils, BigNumber } = require("ethers");

const moveTime = require("./utils/move-time");

describe("Vault", function () {
  let vaultToken,
    takeToken,
    vault,
    takepileFactory,
    xTakeFactory,
    driver,
    owner,
    alice,
    bob,
    charlie,
    treasury;
  let aliceAddr, bobAddr, charlieAddr, treasuryAddr;

  before(async function () {
    [owner, alice, bob, charlie, treasury] = await ethers.getSigners();
    [aliceAddr, bobAddr, charlieAddr, treasuryAddr] = await Promise.all(
      [alice, bob, charlie, treasury].map((x) => x.getAddress())
    );

    const TestToken = await ethers.getContractFactory("TestToken");
    vaultToken = await TestToken.deploy("TestToken", "TEST", 1000000);
    await vaultToken.deployed();

    takeToken = await TestToken.deploy("Takepile Governance", "TAKE", 1000000);
    await takeToken.deployed();

    const TakepileFactory = await ethers.getContractFactory("TakepileFactory");
    takepileFactory = await TakepileFactory.deploy();
    await takepileFactory.deployed();

    const XTakeFactory = await ethers.getContractFactory("xTakeFactory");
    xTakeFactory = await XTakeFactory.deploy();
    await takepileFactory.deployed();

    const LiquidationPass = await ethers.getContractFactory("LiquidationPass");
    liquidationPass = await LiquidationPass.deploy("https://takepile.com/liquidation-pass.gif");
    await liquidationPass.deployed();

    const TakepileDriver = await ethers.getContractFactory("TakepileDriver");
    driver = await TakepileDriver.deploy(
      takeToken.address,
      takepileFactory.address,
      xTakeFactory.address,
      treasuryAddr,
      liquidationPass.address
    );
    await driver.deployed();

    // Transfer takepileFactory ownership to driver
    takepileFactory.transferOwnership(driver.address);

    await driver.createVault("Test Vault", vaultToken.address);

    vault = await ethers.getContractAt("Vault", await driver.vaults(0));

    // Initial balances
    await vaultToken.transfer(aliceAddr, 1000);
    await vaultToken.transfer(bobAddr, 1000);
    await vaultToken.transfer(charlieAddr, 1000);

    await driver.setVaultDistributionRates(
      vault.address,
      "1585489599188229600", // 1e27*0.05/(365*24*60*60)
      "3170979198376459300",
      "4756468797564688000",
      "6341958396752919000"
    );

    // Transfer to driver for distribution
    await takeToken.approve(driver.address, 100000);
    await takeToken.transfer(driver.address, 100000);
  });

  describe("Deployment", function () {
    it("Should initialize with correct token address", async function () {
      expect(await vault.token()).to.equal(vaultToken.address);
    });
    it("Should initialize with correct name", async function () {
      expect(await vault.name()).to.equal('Test Vault');
    });
  });

  describe("Staking", function () {
    it("Should allow staking the ERC20 token", async function () {
      expect(await vaultToken.balanceOf(aliceAddr)).to.be.eq(1000);
      await expect(
        vault.connect(alice).stake(500, 60 * 60 * 24 * 30)
      ).to.be.revertedWith("ERC20: insufficient allowance");

      await vaultToken.connect(alice).approve(vault.address, 1000);
      await expect(await vault.connect(alice).stake(500, 60 * 60 * 24 * 30)).to
        .be.ok;

      expect(await vaultToken.balanceOf(aliceAddr)).to.be.eq(500);
      expect(await vault.getStakeCount(aliceAddr)).to.be.eq(1);
    });
  });

  describe("Unstaking", function () {
    it("Should not allow unstaking if unlock time not reached", async function () {
      await expect(vault.connect(alice).unstake(0, 500)).to.be.revertedWith(
        "Vault: unlock period not reached"
      );
    });
    it("Should allow unstaking after unlock time is reached", async function () {
      await moveTime(60 * 60 * 24 * 30);
      expect(await vault.connect(alice).unstake(0, 500)).to.be.ok;
      expect(await vaultToken.balanceOf(aliceAddr)).to.be.eq(1000);
      expect(await takeToken.balanceOf(aliceAddr)).to.be.eq(4); // 500 * .1 / 12 = 4.166
    });
  });

  describe("Claiming", function () {
    it("Should allow another staking", async function () {
      await vaultToken.connect(alice).approve(vault.address, 1000);
      await expect(await vault.connect(alice).stake(1000, 60 * 60 * 24 * 30))
        .to.be.ok;

      expect(await vaultToken.balanceOf(aliceAddr)).to.be.eq(0);
      expect(await vault.getStakeCount(aliceAddr)).to.be.eq(2);
    });
    it("Should not allow claim if within 7 days of stake date", async function () {
      await expect(vault.connect(alice).claim(1)).to.be.revertedWith(
        "Vault: next claim period not reached"
      );
    });
    it("Should allow claim 7 days after initial stake date", async function () {
      await moveTime(60 * 60 * 24 * 365);
      expect(await takeToken.balanceOf(aliceAddr)).to.be.eq(4);
      expect(await vault.connect(alice).claim(1)).to.be.ok;
      expect(await takeToken.balanceOf(aliceAddr)).to.be.eq(104);
    });
  });
});
