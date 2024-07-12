


function main(params) {
    console.log('');
    console.log('*********************************************************');
    console.log('');
    console.log('Hello')
    console.log('Test');
    console.log('This is on the test branch')

    console.log('');
    console.log('PARAMS');
    console.log(JSON.stringify(params, null, 2));

    console.log('');
    console.log('ENV');
    console.log(JSON.stringify(process.env, null, 2));

    console.log('');
    console.log('*********************************************************');
    console.log('');

    // const base = new Base(params, params.pickArguments);
	// return base.request(pick(params, ['body', 'path', 'method']));

}

main(process.argv);