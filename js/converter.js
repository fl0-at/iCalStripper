function convertICalToJSON(iCal) {
	const convert = async (iCal) => {
		const icsRes = await fetch(iCal)
		const icsData = await icsRes.text()
		// Convert
		const data = icsToJson(icsData)
		return data
	}

	return convert;
}