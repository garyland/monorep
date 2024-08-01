
const crypto = require('crypto');
const http = require('http');
const https = require('https');
const axios = require('axios');
const moment = require('moment');

const get = require('lodash/get');
const pickBy = require('lodash/pickBy');

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
        this.args = args;
        this.hmacKey = args.hmacKey || 'aX2i9vZAnNUrh4QVqpYe0BFYEHT3tQsC';
        this.host = ENVIRONMENTS[args.environment];
        this.port = args.port || (this.host !== ENVIRONMENTS.local ? 443 : 3080);
        this.routePrefix = args.routePrefix || '/rpc/v1/';
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

                    console.log('');
                    console.log(`No more data in response. Exiting script with code ${intProcessExit}.`);
                    console.log(`${moment().format('DD/MM/YYYY HH:mm:ss')}`);
                    console.log('');
                    process.exit(intProcessExit);
                });
            }).catch((objError) => {
                console.log('');
                console.error(`Problem with request: ${objError.message} `);
                console.log(`${moment().format('DD/MM/YYYY HH:mm:ss')}`);
                console.log('');
                process.exit(1);
            });
    }
}

function main() {
    // Read arguments from passed in variables
    const args = {
        hmacKey: undefined,
        environment: undefined,
        routePrefix: '',
        body: {},
        path: undefined,
        method: undefined,
    };

    console.log('');
    console.log('*****************************');
    console.log(moment().format('DD/MM/YYYY HH:mm:ss'));

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
        console.log('');
        console.log('Following required parameters are missing: ');
        console.log(arrMissingArguments.join('; '));
        console.log('');
        console.log(`${moment().format('DD/MM/YYYY HH:mm:ss')}`);
        process.exit(1);
        return;
    }

	const base = new Base(args);
	return base.request();
}

main();