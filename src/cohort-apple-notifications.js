const apn = require('apn')

var options = {
	token: {
		key: "./AuthKey_6TA7832PAJ.p8",
		keyId: "6TA7832PAJ",
		teamId: "J93D25NHHG"
	}
}

module.exports = new apn.Provider(options)
