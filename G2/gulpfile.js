/* global process */
/// <binding BeforeBuild='bundle' />
var gulp = require("gulp")
var browserify = require("browserify");
var plumber = require('gulp-plumber');
var reactify = require("reactify");
var vinlySource = require("vinyl-source-stream");
var vinylBuffer = require("vinyl-buffer");
var zip = require("gulp-zip");
var uglify = require('gulp-uglify');
var protractor = require("gulp-protractor").protractor;
var path = require('path');
var shell = require('gulp-shell');
var cucumberHtmlReporter = require('gulp-protractor-cucumber-html-report');
var foreach = require('gulp-foreach');
var gutil = require('gulp-util');


var cucumberErrorMessage = null;


// Read debug mode from node environment variable
// Ensure this is set to 'production' for relevent environments by running
// Set NODE_ENV='production'
// in the command line.
var debug_mode = function () {
    if (process.env.NODE_ENV == 'undefined' || process.env.NODE_ENV == 'development') {
        return true;
    }
    return false;
};


// Bundle static files together, performing the browsify and reactify transformations.
// Copies the resulting files into the .static folder which will be served to the client. This task comes in two forms - BundleProduction and Bundle
gulp.task('bundleProduction', function () {
    gulp.src(['client/index.html', 'client/styles/**', 'node_modules/bootstrap/dist/css/bootstrap.min.css', 'client/lib/**', 'client/scripts/**', 'client/images/*'])
        .pipe(gulp.dest('./.static'))
    return browserify({
        entries: 'client/browserifyIndex.js',
        debug: debug_mode()
    })
        .transform(reactify)
        .bundle()
        .pipe(vinlySource('app.js'))
        .pipe(vinylBuffer())
        .pipe(uglify({
            options: {
                compress: {
                    dead_code: true,  // discard unreachable code
                    drop_debugger: true,  // discard “debugger” statements
                    global_defs: {      // global definitions
                        "DEBUG": debug_mode(),      // matters for some libraries
                    },
                }
            }
        }))
        .pipe(gulp.dest('./.static'));
});

gulp.task('bundle', function () {
    gulp.src(['client/index.html', 'client/styles/**', 'node_modules/bootstrap/dist/css/bootstrap.min.css', 'client/lib/**', 'client/scripts/**', 'client/images/*'])
        .pipe(gulp.dest('./.static'))
    return browserify({
        entries: 'client/browserifyIndex.js',
        debug: debug_mode()
    })
        .transform(reactify)
        .bundle()
        .pipe(vinlySource('app.js'))
        .pipe(vinylBuffer())
        .pipe(gulp.dest('./.static'));
});


// Creates a deployable distribution of the code
gulp.task('build-dist-package', ['bundleProduction'], function () {
    gulp.src(['.static/**/*'])
        .pipe(gulp.dest('./builds/distPackage/.static'))

    gulp.src(['models/**/*'])
        .pipe(gulp.dest('./builds/distPackage/models'))

    gulp.src(['server/**/*'])
        .pipe(gulp.dest('./builds/distPackage/server'))

    gulp.src(['app.js', 'web.config'])
        .pipe(gulp.dest('./builds/distPackage'))

    gulp.src(['package.json'])
        .pipe(gulp.dest('./builds/distPackage'))

    gulp.src(['./deployment/AppSettings.js'])
        .pipe(gulp.dest('./builds/distPackage/server/', { overwrite: true }))

    gulp.src(['./deployment/settings.js'])
        .pipe(gulp.dest('./builds/distPackage/.static/', { overwrite: true }))
});

// Creates the distributable package and zips it ready for deployment
gulp.task('build', ['build-dist-package'], function () {
    return gulp.src(['./builds/distPackage/**'], { dot: true })
        .pipe(zip('dist.zip'))
        .pipe(gulp.dest('./builds'))
})

gulp.task('karma-dev', function (done) {
    var karmaServer = require('karma').Server;
    new karmaServer({
        configFile: __dirname + '/karma.conf.js',
        browsers: ['Chrome']
    }, function (karmaResult) {
        if (karmaResult === 1) {
            done('karma:test failed with code ' + karmaResult);
            process.exit();
        }
        else {
            done();
            process.exit();
        }
    }).start();
});


gulp.task('karma-server', function (done) {
    var karmaServer = require('karma').Server;
    new karmaServer({
        configFile: __dirname + '/karma.conf.js',
        browsers: ['PhantomJS']
    }, function (karmaResult) {
        if (karmaResult === 1) {
            //process.exit();
            done('karma:test failed with code ' + karmaResult);
        }
        else {
            //process.exit();
            done();
        }
    }).start();
});

gulp.task('jasmineUITesting', function () {
    return gulp.src(["./test_e2e/jasmine/specs/*spec.js"])
    .pipe(protractor({
        configFile: "./test_e2e/jasmine/protractor.conf.js"
    }))
    .on('error', function (e) { throw e })
});

gulp.task('mochaUITesting', function () {
    return gulp.src(["./test_e2e/mocha/specs/*spec.js"])
    .pipe(protractor({
        configFile: "./test_e2e/mocha/protractor.conf.js"
    }))
    .on('error', function (e) { throw e })
});


gulp.task('functionalUITestCucumber', function () {
    cucumberErrorMessage = null;
    
    return gulp.src(["./test_e2e//cucumber/Features/*.feature"])
    .pipe(plumber(function (err) {
        cucumberErrorMessage = err.toString();
        this.emit('end');
    }))
    .pipe(protractor({
        configFile: "./test_e2e/cucumber/protractor.conf.js"
    }))
});

gulp.task('uiTestCucucmberJUnit', ['functionalUITestCucumber'], function () {
    return gulp.src('./test_e2e/cucumber/testResults/cucumber-test-results*.json', { read: false })
             .pipe(
        shell([
            '<%=  f(file) %>'
        ], {
            templateData: {
                f: function (file) {
                    return 'type test_e2e\\cucumber\\testResults\\' + path.basename(file.path) + '| "node_modules/.bin/cucumber-junit.cmd" > test_e2e\\cucumber\\testResults\\' + path.basename(file.path, path.extname(file.path)).replace(" ", "_") + '.xml'
                          
                }
            }
        })
    )
});
gulp.task('uiTestCucumberHtmlReport', ['uiTestCucucmberJUnit'], function () {
    return gulp.src('./test_e2e/cucumber/testResults/cucumber-test-results*.json').pipe(
        foreach(function (stream, file) {
            return stream.pipe(
                cucumberHtmlReporter({
                    dest: 'test_e2e/cucumber/testResults/',
                    filename: path.basename(file.path, path.extname(file.path)) + ".html"
                })
            )
        }));
});

gulp.task('uiTestCucucmberThrowErrorOnFail', ['uiTestCucumberHtmlReport'], function () {
    if (cucumberErrorMessage != null) {
        throw new gutil.PluginError({
            plugin: 'cucumber functional ui test',
            message: cucumberErrorMessage
        });
    }
});
gulp.task('cucumberUITesting', ['uiTestCucucmberThrowErrorOnFail'], shell.task([
    'test_e2e\\cucumber\\pickels\\pickles.exe --feature-directory=.\\test_e2e\\cucumber\\Features^  --output-directory=.\\test_e2e\\cucumber\\LivingDocumentation^ --documentation-format=dhtml'
]));