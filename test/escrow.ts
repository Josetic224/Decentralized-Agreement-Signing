import {
  time,
  loadFixture,
} from "@nomicfoundation/hardhat-toolbox/network-helpers";
import { anyValue } from "@nomicfoundation/hardhat-chai-matchers/withArgs";
import { expect } from "chai";
import hre from "hardhat";
import { SalesAgreement } from "../typechain-types";

describe("SalesAgreement Contract", function () {
  async function deploySalesAgreementFixture() {
    const [deployer, seller, buyer, escrowAgent] =
      await hre.ethers.getSigners();
    const SalesAgreementFactory = await hre.ethers.getContractFactory(
      "salesAgreement"
    );
    const salesAgreement =
      (await SalesAgreementFactory.deploy()) as SalesAgreement;
    await salesAgreement.waitForDeployment();
    return { salesAgreement, deployer, seller, buyer, escrowAgent };
  }

  it("Should create an agreement", async function () {
    const { salesAgreement, seller, buyer, escrowAgent } = await loadFixture(
      deploySalesAgreementFixture
    );
    const itemName = "Laptop";
    const itemDescription = "Gaming Laptop with RTX 4090";
    const price = hre.ethers.parseEther("1.0"); // 1 ETH
    const deliveryDate = (await time.latest()) + 86400; // 1 day from now
    const isEscrowUsed = true;
    const isRefundable = true;
    const disputeResolution = 0; // COURT
    const paymentToken = hre.ethers.ZeroAddress; // ETH payment

    await expect(
      salesAgreement
        .connect(seller)
        .createAgreement(
          itemName,
          itemDescription,
          price,
          buyer.address,
          paymentToken,
          deliveryDate,
          isEscrowUsed,
          escrowAgent.address,
          isRefundable,
          disputeResolution
        )
    ).to.emit(salesAgreement, "AgreementCreated");
  });

  it("Should confirm the agreement and send funds to escrow", async function () {
    const { salesAgreement, seller, buyer, escrowAgent } = await loadFixture(
      deploySalesAgreementFixture
    );
    const itemName = "Laptop";
    const itemDescription = "Gaming Laptop with RTX 4090";
    const price = hre.ethers.parseEther("1.0"); // 1 ETH
    const deliveryDate = (await time.latest()) + 86400; // 1 day from now
    const isEscrowUsed = true;
    const isRefundable = true;
    const disputeResolution = 0; // COURT
    const paymentToken = hre.ethers.ZeroAddress; // ETH payment

    await salesAgreement
      .connect(seller)
      .createAgreement(
        itemName,
        itemDescription,
        price,
        buyer.address,
        paymentToken,
        deliveryDate,
        isEscrowUsed,
        escrowAgent.address,
        isRefundable,
        disputeResolution
      );

    await expect(
      salesAgreement.connect(buyer).confirmAgreement(0, { value: price })
    ).to.emit(salesAgreement, "AgreementConfirmed");
  });

  it("Should release escrow to the seller", async function () {
    const { salesAgreement, seller, buyer, escrowAgent } = await loadFixture(
      deploySalesAgreementFixture
    );
    const itemName = "Laptop";
    const itemDescription = "Gaming Laptop with RTX 4090";
    const price = hre.ethers.parseEther("1.0"); // 1 ETH
    const deliveryDate = (await time.latest()) + 86400; // 1 day from now
    const isEscrowUsed = true;
    const isRefundable = true;
    const disputeResolution = 0; // COURT
    const paymentToken = hre.ethers.ZeroAddress; // ETH payment

    // Create agreement
    await salesAgreement
      .connect(seller)
      .createAgreement(
        itemName,
        itemDescription,
        price,
        buyer.address,
        paymentToken,
        deliveryDate,
        isEscrowUsed,
        escrowAgent.address,
        isRefundable,
        disputeResolution
      );

    // Buyer confirms and sends payment
    await salesAgreement.connect(buyer).confirmAgreement(0, { value: price });

    // Advance time to ensure delivery date is reached
    await time.increaseTo(deliveryDate + 1);

    // Buyer marks the item as delivered
    await salesAgreement.connect(buyer).markAsDelivered(0);

    // Get initial balances
    const initialSellerBalance = await hre.ethers.provider.getBalance(
      seller.address
    );
    const initialContractBalance = await hre.ethers.provider.getBalance(
      await salesAgreement.getAddress()
    );

    // Release escrow and check event
    await expect(salesAgreement.connect(escrowAgent).releaseEscrow(0))
      .to.emit(salesAgreement, "AgreementCompleted")
      .withArgs(0, seller.address, buyer.address);

    // Verify final balances
    const finalSellerBalance = await hre.ethers.provider.getBalance(
      seller.address
    );
    const finalContractBalance = await hre.ethers.provider.getBalance(
      await salesAgreement.getAddress()
    );

    expect(finalSellerBalance - initialSellerBalance).to.equal(price);
    expect(initialContractBalance - finalContractBalance).to.equal(price);
  });

  it("Should revert if trying to release escrow before marking as delivered", async function () {
    const { salesAgreement, seller, buyer, escrowAgent } = await loadFixture(
      deploySalesAgreementFixture
    );
    const itemName = "Laptop";
    const itemDescription = "Gaming Laptop with RTX 4090";
    const price = hre.ethers.parseEther("1.0");
    const deliveryDate = (await time.latest()) + 86400;
    const isEscrowUsed = true;
    const isRefundable = true;
    const disputeResolution = 0;
    const paymentToken = hre.ethers.ZeroAddress;

    await salesAgreement
      .connect(seller)
      .createAgreement(
        itemName,
        itemDescription,
        price,
        buyer.address,
        paymentToken,
        deliveryDate,
        isEscrowUsed,
        escrowAgent.address,
        isRefundable,
        disputeResolution
      );

    await salesAgreement.connect(buyer).confirmAgreement(0, { value: price });
    await time.increaseTo(deliveryDate + 1);

    // Try to release escrow before marking as delivered
    await expect(
      salesAgreement.connect(escrowAgent).releaseEscrow(0)
    ).to.be.revertedWithCustomError(salesAgreement, "DeliveryNotConfirmed");
  });
});
