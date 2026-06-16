const protobuf = require('protobufjs');
const root = protobuf.parse("syntax = \"proto3\";\nmessage RemoteMessage {\n  RemoteAppLinkLaunchRequest req = 20;\n}\nmessage RemoteAppLinkLaunchRequest {\n  RemoteAppLink link = 1;\n}\nmessage RemoteAppLink {\n  string url = 12;\n}\n").root;
const msg = root.lookupType('RemoteMessage');
const buf = Buffer.from('a201150a136211636f6d2e6e6574666c69782e6e696e6a61', 'hex');
console.log(JSON.stringify(msg.decode(buf)));
