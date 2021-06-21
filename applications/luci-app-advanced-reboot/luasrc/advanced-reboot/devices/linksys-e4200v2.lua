return {
	vendorName = "Linksys",
	deviceName = "E4200v2",
	boardNames = { "linksys-e4200v2", "linksys,e4200v2" },
	partition1MTD = "mtd3",
	partition2MTD = "mtd5",
	labelOffset = 32,
	bootEnv1 = "boot_part",
	bootEnv1Partition1Value = 1,
	bootEnv1Partition2Value = 2,
	bootEnv2 = "bootcmd",
	bootEnv2Partition1Value = "run nandboot",
	bootEnv2Partition2Value = "run altnandboot"
}
