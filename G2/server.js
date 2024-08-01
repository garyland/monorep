
const crypto = require('crypto');
const http = require('http');
const https = require('https');

function pick(obj, arrToPick) {
    if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) {
        console.error('Invalid first parameter');
        process.exit(1);
    }
    
    if (!Array.isArray(arrToPick) || arrToPick.length === 0) {
        return obj;
    }
    
    const objPickedOptions = Object.keys(obj).reduce((objResult, strKey) => {
        if (!arrToPick.includes(strKey)) {
            return objResult;
        }
    
        objResult[strKey] = obj[strKey];
        return objResult;

    }, {});
    
    return objPickedOptions;
}

const DEFAULTS = {
    SUBDOMAIN: 'system',
    HOST: 'opasg2.com'
};

const ENVIRONMENTS = {
    qa3: 'codeengine.opasg2.com'
}

class Base {
    constructor(args) {
        // const { formattedArgs, options } = this.segregateArgs(args, argOptions);
        this.args = args;

        console.log(JSON.stringify(this.args, null, 2));

        this.hmacKey = args.hmacKey || 'oZi6w7rDzNgV5qitMlPcqJwUP4rfTaJ3';
        this.host = ENVIRONMENTS[args.environment];
        this.port = args.port || (this.host !== ENVIRONMENTS.local ? 443 : 3080);
        this.routePrefix = args.routePrefix || '/rpc/v1/';

        console.log('hmacKey', this.hmacKey);
        console.log('host', this.host);
        console.log('port', this.port);
        console.log('routePrefix', this.routePrefix);
    }

    // segregateArgs(args, argOptions) {
    //     return {
    //         formattedArgs: pick(args, argOptions),
    //         options: pick(args, ['hmacKey', 'environment', 'port', 'routePrefix'])
    //     }
    // }

    getHttpPackage() {
        return this.host === ENVIRONMENTS.local ? http : https;
    }

    generateHmac(time, verb, path, body) {
        const hmac = crypto.createHmac('sha256', this.hmacKey);
        hmac.update(time);
        hmac.update(verb);
        hmac.update(path);

        if (Object.keys(body).length) {
            const contentHash = crypto.createHash('md5');
            contentHash.update(JSON.stringify(body));
            hmac.update(contentHash.digest('hex'));
        }

        return hmac.digest('hex');
    }

    request() {
        console.log('In request');

        const body = JSON.stringify(this.args.body);
        const time = Math.floor(Date.now()).toString();
        const path = this.routePrefix + this.args.path;

        return new Promise((resolve, reject) => {
            console.log(`Sending request to ${this.host}:${this.port}${path}`);
            const request = this.getHttpPackage().request({
                hostname: this.host,
                port: parseInt(this.port),
                path: path,
                method: this.args.method,
                headers: {
                    'Content-Length': body ? Buffer.byteLength(body) : 0,
                    'Content-Type': 'application/json',
                    Authentication: `G2 ${time}:${this.generateHmac(time, this.args.method, path, this.args.body)}`
                }
            }, res => {
                const arrStream = [];

                res.setEncoding('utf8');
                res.on('data', (chunk) => {
                    console.log(chunk);
                    arrStream.push(chunk);
                });

                res.on('end', () => {
                    console.log(`No more data in response. Exiting script.`);
                    res.statusCode !== 200 || arrStream[arrStream.length - 1] === 'Upgrades partially ran' ? reject() : resolve();
                });
            });

            request.on('error', (e) => {
                console.error(`problem with request: ${e.message}`);
                reject();
                process.exit(1);
            });

            request.write(body);
            request.end();
        });
    }
}

function main() {
    // Read arguments from passed in variables
    const args = {
        hmacKey: undefined,
        environment: undefined,
        // port: undefined,
        routePrefix: '',
        body: {},
        path: undefined,
        method: undefined,
    };

    const arrMissingArguments = [];

    if (typeof process.env['CE_HMAC'] === 'undefined') {
        arrMissingArguments.push('HMAC');
    } else {
        args.hmacKey = process.env['CE_HMAC'];
    }
    
    if (typeof process.env['CE_ENVIRONMENT'] === 'undefined') {
        arrMissingArguments.push('ENVIRONMENT');
    } else {
        args.environment = process.env['CE_ENVIRONMENT'];
    }

    if (typeof process.env['CE_PATH'] === 'undefined') {
        arrMissingArguments.push('PATH');
    } else {
        args.path = process.env['CE_PATH'];
    }

    if (typeof process.env['CE_METHOD'] === 'undefined') {
        arrMissingArguments.push('METHOD');
    } else {
        args.method = process.env['CE_METHOD'];
    }

    if (arrMissingArguments.length > 0) {
        console.log('Following required parameters are missing: ');
        console.log(arrMissingArguments.join('; '));
        return;
    }

	const base = new Base(args);
	return base.request();
}


// function main(params) {
//     console.log('');
//     console.log('*********************************************************');
//     console.log('');
//     console.log('Hello')
//     console.log('Test');
//     console.log('This is on the test branch')

//     console.log('');
//     console.log('PARAMS');
//     console.log(JSON.stringify(params, null, 2));

//     console.log('');
//     console.log('ENV');
//     console.log(JSON.stringify(process.env, null, 2));

//     console.log('');
//     console.log('*********************************************************');
//     console.log('');

//     // const base = new Base(params, params.pickArguments);
// 	// return base.request(pick(params, ['body', 'path', 'method']));

// }

main();