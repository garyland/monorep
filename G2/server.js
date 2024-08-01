
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const axios = require('axios');
const moment = require('moment');

const get = require('lodash/get');
const pickBy = require('lodash/pickBy');

// function pick(obj, arrToPick) {
//     if (!obj || typeof obj !== 'object' || Object.keys(obj).length === 0) {
//         console.error('Invalid first parameter');
//         process.exit(1);
//     }
    
//     if (!Array.isArray(arrToPick) || arrToPick.length === 0) {
//         return obj;
//     }
    
//     const objPickedOptions = Object.keys(obj).reduce((objResult, strKey) => {
//         if (!arrToPick.includes(strKey)) {
//             return objResult;
//         }
    
//         objResult[strKey] = obj[strKey];
//         return objResult;

//     }, {});
    
//     return objPickedOptions;
// }

const ERROR_PREFIX = 'ERR';

const DEFAULTS = {
    SUBDOMAIN: 'system',
    HOST: 'opasg2.com',
}

const ENVIRONMENTS = {
    qa: `https://${DEFAULTS.SUBDOMAIN}.qa1.${DEFAULTS.HOST}`,
    qa2: `https://${DEFAULTS.SUBDOMAIN}.qa2.${DEFAULTS.HOST}`,
    qa3: `https://${DEFAULTS.SUBDOMAIN}.qa3.${DEFAULTS.HOST}`,
    local: 'http://127.0.0.1',
}

class Base {
    constructor(args) {
        // const { formattedArgs, options } = this.segregateArgs(args, argOptions);
        this.args = args;

        console.log(JSON.stringify(this.args, null, 2));

        this.hmacKey = args.hmacKey || 'aX2i9vZAnNUrh4QVqpYe0BFYEHT3tQsC';
        this.host = ENVIRONMENTS[args.environment];
        this.port = args.port || (this.host !== ENVIRONMENTS.local ? 443 : 3080);
        this.routePrefix = args.routePrefix || '/rpc/v1/';

        console.log('hmacKey', this.hmacKey);
        console.log('host', this.host);
        console.log('port', this.port);
        console.log('routePrefix', this.routePrefix);
    }

    getHttpPackage() {
        return this.host === ENVIRONMENTS.local ? http : https;
    }

    generateHmac(time, verb, pathIn, body) {
        const hmac = crypto.createHmac('sha256', this.hmacKey);
        hmac.update(time);
        hmac.update(verb);
        hmac.update(pathIn);

        const contentHash = crypto.createHash('md5');
        contentHash.update(JSON.stringify(body));
        hmac.update(contentHash.digest('hex'));

        return hmac.digest('hex');
    }

    generateOptions(params, pathIn, time, body, strResponseType = 'stream') {
        const options = {
            method: params.method.toLowerCase(),
            port: parseInt(this.port, 10),
            timeout: 900000,
            baseURL: `${this.host}:${parseInt(this.port, 10)}`,
            url: pathIn,
            responseType: strResponseType,
            headers: {
                'User-Agent': `node/${process.version} ${process.platform} ${process.arch}`,
                Authentication: `G2 ${time}:${this.generateHmac(time, params.method, pathIn, body)}`,
            },
        };

        options.headers['Content-Length'] = Buffer.byteLength(JSON.stringify(body));
        options.headers['Content-Type'] = 'application/json';
        options.data = body;
        return options;
    }

    request(params) {
        const body = pickBy(get(this.args, 'body', {}), Boolean);
        const time = Date.now().toString();
        const fullUrl = this.routePrefix + this.args.path;

        console.log(`\r\nSending request to ${this.host}:${this.port}${fullUrl}`);
        console.log(`${moment().format('DD/MM/YYYY HH:mm:ss')}\r\n`);

        return axios(this.generateOptions(this.args, fullUrl, time, body))
            .then((response) => {
                let arrChunks = [];
                const arrResponse = [];

                response.data.on('data', (objChunk) => {
                    let strChunk = objChunk.toString();
                    strChunk = strChunk.replace(/\n\n/g, '\n');
                    let strSplitChunk = strChunk;
                    if (strChunk.includes('\n')) {
                        const arrLines = strChunk.split('\n');
                        arrChunks.push(arrLines[0]);

                        const strResponse = arrChunks.join('');
                        arrResponse.push(strResponse);
                        console.log(strResponse);

                        arrChunks = [];

                        if (arrLines.length > 1) {
                            for (let intLoop = 1; intLoop < arrLines.length; intLoop += 1) {
                                const strLine = arrLines[intLoop];
                                if (intLoop === arrLines.length - 1) {
                                    strSplitChunk = strLine;
                                } else {
                                    arrResponse.push(strLine);
                                    console.log(strLine);
                                }
                            }
                        }
                    }

                    arrChunks.push(strSplitChunk);
                });

                response.data.on('end', () => {
                    // if there are any chunks left over make sure we console log them
                    if (arrChunks.length > 0) {
                        arrChunks.forEach((strChunk) => {
                            console.log(strChunk);
                            arrResponse.push(strChunk);
                        });
                    }

                    const strError = arrResponse.pop();
                    const intProcessExit = response.status !== 200 || (typeof strError === 'string' && strError.startsWith(ERROR_PREFIX)) ? 1 : 0;

                    if (intProcessExit === 1) {
                        console.error(`Error encountered ${strError.startsWith(ERROR_PREFIX) ? `: ${strError}` : ''}`);
                    }

                    console.log(`No more data in response. Exiting script with code ${intProcessExit}.`);
                    console.log(`${moment().format('DD/MM/YYYY HH:mm:ss')}`);
                    process.exit(intProcessExit);
                });
            }).catch((objError) => {
                console.error(`Problem with request: ${objError.message} `);
                console.log(`${moment().format('DD/MM/YYYY HH:mm:ss')}`);
                process.exit(1);
            });
    }

    // request() {
    //     console.log('In request');

    //     const body = JSON.stringify(this.args.body);
    //     const time = Math.floor(Date.now()).toString();
    //     const path = this.routePrefix + this.args.path;

    //     return new Promise((resolve, reject) => {
    //         console.log(`Sending request to ${this.host}:${this.port}${path}`);
    //         const request = this.getHttpPackage().request({
    //             hostname: this.host,
    //             port: parseInt(this.port),
    //             path: path,
    //             method: this.args.method,
    //             headers: {
    //                 'Content-Length': body ? Buffer.byteLength(body) : 0,
    //                 'Content-Type': 'application/json',
    //                 Authentication: `G2 ${time}:${this.generateHmac(time, this.args.method, path, this.args.body)}`
    //             }
    //         }, res => {
    //             const arrStream = [];

    //             res.setEncoding('utf8');
    //             res.on('data', (chunk) => {
    //                 console.log(chunk);
    //                 arrStream.push(chunk);
    //             });

    //             res.on('end', () => {
    //                 console.log(`No more data in response. Exiting script.`);
    //                 res.statusCode !== 200 || arrStream[arrStream.length - 1] === 'Upgrades partially ran' ? reject() : resolve();
    //             });
    //         });

    //         request.on('error', (e) => {
    //             console.error(`problem with request: ${e.message}`);
    //             reject();
    //             process.exit(1);
    //         });

    //         request.write(body);
    //         request.end();
    //     });
    // }
}

function main() {
    // const args = {
    //     // hmacKey: 'sMo4wSSZ1c7aiSmm6YP7CEcIiayiuX6M',
    //     environment: 'local',
    //     // port: undefined,
    //     routePrefix: '',
    //     body: {},
    //     path: 'communication/automatic',
    //     method: 'POST'
    // };
    

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

main();