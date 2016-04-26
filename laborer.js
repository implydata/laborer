'use strict';

var fs = require('fs');
var path = require('path');

var gulp = require('gulp');
var $ = require('gulp-load-plugins')();

var autoprefixer = require('autoprefixer');

var merge = require('merge-stream');
var del = require('del');
var typescript = require('typescript');


var tsLintConfig = require('./tslint-rules');
var sassLintRules = require('./sasslint-rules');
var gr = require('./gulp-reporters');

var webpack = require("webpack");


// Modifiers ==============

var globalShowStats = false;

exports.showStats = function() {
  globalShowStats = true;
};

exports.hideStats = function() {
  globalShowStats = false;
};


var globalFailOnError = false;

exports.failOnError = function() {
  globalFailOnError = true;
};


// TASKS ==============

exports.taskStyle = function(opt) {
  var opt = opt || {};
  var rules = opt.rules || sassLintRules;
  return function() {
    var errorTexts = [];

    return gulp.src('./src/client/**/*.scss')
      .pipe($.sassLint({ rules: rules }))
      .pipe(gr.sassLintReporterFactory({ errorTexts: errorTexts }))
      .pipe($.sass({
        outputStyle: 'compressed'
      }).on('error', gr.sassErrorFactory({
        errorTexts: errorTexts
      })))
      .pipe($.postcss([
        autoprefixer({
          browsers: ['> 1%', 'last 3 versions', 'Firefox ESR', 'Opera 12.1'],
          remove: false // If you have no legacy code, this option will make Autoprefixer about 10% faster.
        })
      ]))
      .pipe(gulp.dest('./build/client'))
      .on('finish', function() {
        gr.writeErrors('./webstorm/errors', errorTexts);
        if (globalFailOnError && errorTexts.length) process.exit(1);
      });
  };
};


exports.taskIcons = function() {
  return function() {
    return gulp.src('./src/client/**/*.svg')
      // Just copy for now
      .pipe(gulp.dest('./build/client'))
  };
};


exports.taskHtml = function() {
  return function() {
    return gulp.src('./src/client/**/*.html')
      // Just copy for now
      .pipe(gulp.dest('./build/client'))
  };
};


exports.taskClientTypeScript = function(opt) {
  var opt = opt || {};
  var declaration = opt.declaration || false;

  var tsProject = $.typescript.createProject({
    typescript: typescript,
    noImplicitAny: true,
    noFallthroughCasesInSwitch: true,
    noImplicitReturns: true,
    noEmitOnError: true,
    target: 'ES5',
    module: 'commonjs',
    declaration: declaration,
    jsx: 'react'
  });

  return function() {
    var errorTexts = [];

    function fixPath(str) {
      return str.replace('/build/tmp/', '/src/');
    }

    var sourceFiles = gulp.src(['./src/{client,common}/**/*.{ts,tsx}'])
      .pipe($.cached('client'))
      .pipe($.tslint({configuration: tsLintConfig}))
      .pipe($.tslint.report(
        gr.tscLintReporterFactory({
          errorTexts: errorTexts,
          fixPath: fixPath
        }),
        { emitError: false }
      ));

    var typeFiles = gulp.src(['./typings/**/*.d.ts']);

    var compiled = merge(sourceFiles, typeFiles)
      .pipe($.typescript(
        tsProject,
        undefined,
        gr.tscReporterFactory({
          errorTexts: errorTexts,
          fixPath: fixPath,
          onFinish: function() {
            gr.writeErrors('./webstorm/errors', errorTexts);
            if (globalFailOnError && errorTexts.length) process.exit(1);
          }
        })
      ));

    if (declaration) {
      return merge([
        compiled.dts.pipe(gulp.dest('./build')),
        compiled.js.pipe(gulp.dest('./build'))
      ])
    } else {
      return compiled.pipe(gulp.dest('./build'));
    }
  };
};


exports.taskServerTypeScript = function(opt) {
  var opt = opt || {};
  var declaration = opt.declaration || false;

  var tsProject = $.typescript.createProject({
    typescript: typescript,
    noImplicitAny: true,
    noFallthroughCasesInSwitch: true,
    noImplicitReturns: true,
    noEmitOnError: true,
    target: 'ES5',
    module: 'commonjs',
    declaration: declaration
  });

  return function() {
    var errorTexts = [];

    var sourceFiles = gulp.src(['./src/{server,common}/**/*.ts'])
      .pipe($.cached('server'))
      .pipe($.tslint({configuration: tsLintConfig}))
      .pipe($.tslint.report(
        gr.tscLintReporterFactory({
          errorTexts: errorTexts
        }),
        { emitError: false }
      ));

    var typeFiles = gulp.src(['./typings/**/*.d.ts']);

    var compiled = merge(sourceFiles, typeFiles)
      .pipe($.typescript(
        tsProject,
        undefined,
        gr.tscReporterFactory({
          errorTexts: errorTexts,
          onFinish: function() {
            gr.writeErrors('./webstorm/errors', errorTexts);
            if (globalFailOnError && errorTexts.length) process.exit(1);
          }
        })
      ));

    if (declaration) {
      return merge([
        compiled.dts.pipe(gulp.dest('./build')),
        compiled.js.pipe(gulp.dest('./build'))
      ])
    } else {
      return compiled.pipe(gulp.dest('./build'));
    }
  };
};


var mochaParams = {
  reporter: 'spec'
};

exports.taskUtilsTest = function() {
  return function() {
    return gulp.src('./build/utils/**/*.mocha.js', {read: false})
      // gulp-mocha needs filepaths so you can't have any plugins before it
      .pipe(mocha(mochaParams));
  };
};


exports.taskModelsTest = function() {
  return function() {
    return gulp.src('./build/models/**/*.mocha.js', {read: false})
      // gulp-mocha needs filepaths so you can't have any plugins before it
      .pipe(mocha(mochaParams));
  };
};


exports.taskClientTest = function() {
  return function() {
    return gulp.src('./build/client/**/*.mocha.js', {read: false})
      // gulp-mocha needs filepaths so you can't have any plugins before it
      .pipe(mocha(mochaParams));
  };
};


exports.taskServerTest = function() {
  return function() {
    return gulp.src('./build/server/**/*.mocha.js', {read: false})
      // gulp-mocha needs filepaths so you can't have any plugins before it
      .pipe(mocha(mochaParams));
  };
};


function webpackCompilerFactory(opt) {
  var opt = opt || {};
  var cwd = process.cwd();
  var files = fs.readdirSync(path.join(cwd, '/build/client'));

  var entryFiles = files.filter(function(file) { return /-entry\.js$/.test(file) });
  if (!entryFiles.length) return null;

  var entry = {};
  entryFiles.forEach(function(entryFile) {
    entry[entryFile.substr(0, entryFile.length - 9)] = './build/client/' + entryFile;
  });

  //{
  //  pivot: './build/client/pivot-entry.js'
  //}

  return webpack({
    context: cwd,
    entry: entry,
    target: opt.target || 'web',
    output: {
      path: path.join(cwd, "/build/public"),
      filename: "[name].js",
      chunkFilename: "[name].[hash].js"
    },
    resolveLoader: {
      root: path.join(__dirname, "node_modules")
    },
    module: {
      loaders: [
        { test: /\.svg$/, loaders: ['raw-loader', 'svgo-loader?useConfig=svgoConfig1'] },
        { test: /\.css$/, loaders: ['style-loader', 'css-loader'] }
      ]
    },
    svgoConfig1: {
      plugins: [
        // https://github.com/svg/svgo
        { removeTitle: true },
        { removeDimensions: true },
        { convertColors: { shorthex: false } },
        { convertPathData: false }
      ]
    }
  });
}


function webpackResultHandler(showStats, err, stats) {
  var errorTexts = [];
  if (err) {
    errorTexts.push('Fatal webpack error: ' + err.message);
  } else {
    var jsonStats = stats.toJson();

    if(jsonStats.errors.length > 0 || jsonStats.warnings.length > 0) {
      errorTexts = jsonStats.errors.concat(jsonStats.warnings);
    }

    if (showStats || globalShowStats) {
      gutil.log("[webpack]", stats.toString({
        colors: true
      }));
    }
  }

  if (errorTexts.length) console.error(errorTexts.join('\n'));
  gr.writeErrors('./webstorm/errors', errorTexts);
  if (globalFailOnError && errorTexts.length) process.exit(1);
}

exports.taskClientPack = function(opt) {
  var opt = opt || {};
  var showStats = opt.showStats;
  return function(callback) {
    var webpackCompiler = webpackCompilerFactory(opt);
    if (!webpackCompiler) return callback();
    webpackCompiler.run(function(err, stats) {
      webpackResultHandler(showStats, err, stats);
      callback();
    });
  };
};


exports.clientPackWatch = function(opt) {
  var opt = opt || {};
  var showStats = opt.showStats;
  var webpackCompiler = webpackCompilerFactory(opt);
  if (!webpackCompiler) throw new Error('no entry files found');
  webpackCompiler.watch({ // watch options:
    aggregateTimeout: 300 // wait so long for more changes
    //poll: true // use polling instead of native watchers
  }, function(err, stats) {
    webpackResultHandler(showStats, err, stats);
  });
};


exports.taskClean = function() {
  return function() {
    del.sync(['./build/**'])
  }
};
