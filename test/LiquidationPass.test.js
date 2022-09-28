const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Liquidation Pass", function () {
  let owner, alice, bob, charlie, treasury;
  let ownerAddr, aliceAddr, bobAddr, charlieAddr, treasuryAddr;
  let liquidationPass;

  before(async function () {
    [owner, alice, bob, charlie, treasury] = await ethers.getSigners();
    [ownerAddr, aliceAddr, bobAddr, charlieAddr, treasuryAddr] = await Promise.all(
      [owner, alice, bob, charlie, treasury].map((x) => x.getAddress())
    );

    const LiquidationPass = await ethers.getContractFactory("LiquidationPass");
    liquidationPass = await LiquidationPass.deploy("https://takepile.com/liquidation-pass.gif");
    await liquidationPass.deployed();

  });

  it("Should initialize with correct symbol and name", async function () {
    expect(await liquidationPass.symbol()).to.equal("Liquidation Pass");
    expect(await liquidationPass.name()).to.equal("Takepile Liquidation Pass");
    expect(await liquidationPass.totalSupply()).to.equal(0);
  });

  it("First purchase should cost correct amount", async function () {
    expect(await liquidationPass.getPrice(1)).to.equal(ethers.utils.parseEther("5"));

    expect(await liquidationPass.connect(alice).purchase({
      value: ethers.utils.parseEther("5")
    })).to.be.ok;
  });

  it("First purchase should have correct tokenURI", async function () {
    const tokenURI = await liquidationPass.tokenURI(1);
    const base64 = tokenURI.split(',')[1];
    const json = JSON.parse(Buffer.from(base64, 'base64'));
    expect(json.name).to.be.eq('Takepile Liquidation Pass #1');
    expect(json.image).to.be.eq('https://takepile.com/liquidation-pass.gif');
    expect(await liquidationPass.totalSupply()).to.equal(1);
  });

  it("Second purchase should cost correct amount", async function () {
    expect(await liquidationPass.getPrice(2)).to.equal(ethers.utils.parseEther("20"));
    expect(await liquidationPass.connect(alice).purchase({
      value: ethers.utils.parseEther("20")
    })).to.be.ok;
    expect(await liquidationPass.totalSupply()).to.equal(2);
  });

  it("Second purchase should have correct tokenURI", async function () {
    const tokenURI = await liquidationPass.tokenURI(2);
    const base64 = tokenURI.split(',')[1];
    const json = JSON.parse(Buffer.from(base64, 'base64'));
    expect(json.name).to.be.eq('Takepile Liquidation Pass #2');
  });

  it("Should allow owner to withdraw amount to recipient", async function () {
    let bobBalance = await bob.getBalance();
    expect(await liquidationPass.withdraw(
      ethers.utils.parseEther("4"),
      bobAddr
    )).to.be.ok;
    expect(await bob.getBalance()).to.be.eq(bobBalance.add(ethers.utils.parseEther('4')));
  });

  it("Should allow owner to drain full contract balance to recipient", async function () {
    let bobBalance = await bob.getBalance();
    expect(await liquidationPass.drain(
      bobAddr
    )).to.be.ok;
    // There is 1 eth left in the contract after previous withdrawal
    expect(await bob.getBalance()).to.be.eq(bobBalance.add(ethers.utils.parseEther('21')));
  });


  it("Should not allow non-owner to withdraw or drain", async function () {
    await expect(liquidationPass.connect(alice).drain(
      bobAddr
    )).to.be.revertedWith('Ownable: caller is not the owner');
    await expect(liquidationPass.connect(alice).withdraw(
      1,
      bobAddr
    )).to.be.revertedWith('Ownable: caller is not the owner');
  });

});
