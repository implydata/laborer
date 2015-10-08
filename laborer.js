'use strict';

var fs = require('fs');
var path = require('path');

var gulp = require('gulp');
var gutil = require("gulp-util");
var sass = require('gulp-sass');
var scsslint = require('gulp-scss-lint');
var postcss = require('gulp-postcss');
var autoprefixer = require('autoprefixer');
var tsc = require('gulp-typescript');
var tslint = require('gulp-tslint');
var sourcemaps = require('gulp-sourcemaps');

var merge = require('merge-stream');
var debug = require('gulp-debug');
var del = require('del');
var typescript = require('typescript');

var mocha = require('gulp-mocha');

var tsLintConfig = require('./tslint');
var gr = require('./gulp-reporters');

var webpack = require("webpack");

exports.taskStyle = function() {
  return function() {
    var errorTexts = [];

    return gulp.src('./src/client/**/*.scss')
      .pipe(scsslint({
        config: './src/lint/sass-lint.yml',
        customReport: gr.sassLintReporterFactory({
          errorTexts: errorTexts
        })
      }))
      .pipe(sass({
        outputStyle: 'compressed'
      }).on('error', gr.sassErrorFactory({
        errorTexts: errorTexts
      })))
      .pipe(postcss([
        autoprefixer({
          browsers: ['> 1%', 'last 3 versions', 'Firefox ESR', 'Opera 12.1'],
          remove: false // If you have no legacy code, this option will make Autoprefixer about 10% faster.
        })
      ]))
      .pipe(gulp.dest('./build/client'))
      .on('finish', function() {
        gr.writeErrors('./webstorm/errors', errorTexts);
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


exports.taskClientTypeScript = function(opt) {
  var opt = opt || {};
  var declaration = opt.declaration || false;
  return function() {
    var errorTexts = [];

    function fixPath(str) {
      return str.replace('/build/tmp/', '/src/');
    }

    var sourceFiles = gulp.src(['./src/{client,common}/**/*.ts'])
      .pipe(gr.jsxFixerFactory())
      .pipe(gulp.dest('./build/tmp/')) // typescript requires actual files on disk, not just in memory
      .pipe(tslint({
        configuration: tsLintConfig
      }))
      .pipe(tslint.report(
        gr.tscLintReporterFactory({
          errorTexts: errorTexts,
          fixPath: fixPath
        }),
        { emitError: false }
      ));

    var typeFiles = gulp.src(['./typings/**/*.d.ts']);

    var compiled = merge(sourceFiles, typeFiles)
      //.pipe(sourcemaps.init())
      .pipe(tsc(
        {
          typescript: typescript,
          noImplicitAny: true,
          noEmitOnError: true,
          target: 'ES5',
          module: 'commonjs',
          declaration: declaration
        },
        undefined,
        gr.tscReporterFactory({
          errorTexts: errorTexts,
          fixPath: fixPath,
          onFinish: function() { gr.writeErrors('./webstorm/errors', errorTexts); }
        })
      ));
      //.pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: '../client' }))

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
  return function() {
    var errorTexts = [];

    var sourceFiles = gulp.src(['./src/{server,common}/**/*.ts'])
      .pipe(tslint({
        configuration: tsLintConfig
      }))
      .pipe(tslint.report(
        gr.tscLintReporterFactory({
          errorTexts: errorTexts
        }),
        { emitError: false }
      ));

    var typeFiles = gulp.src(['./typings/**/*.d.ts']);

    var compiled = merge(sourceFiles, typeFiles)
      //.pipe(sourcemaps.init())
      .pipe(tsc(
        {
          typescript: typescript,
          noImplicitAny: true,
          noEmitOnError: true,
          target: 'ES5',
          module: 'commonjs',
          declaration: declaration
        },
        undefined,
        gr.tscReporterFactory({
          errorTexts: errorTexts,
          onFinish: function() { gr.writeErrors('./webstorm/errors', errorTexts); }
        })
      ));
      //.pipe(sourcemaps.write('.', {
      //  includeContent: false,
      //  sourceRoot: '../../src/server'
      //}));

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


exports.taskClientPack = function(opt) {
  var opt = opt || {};
  var showStats = opt.showStats || false;
  return function(callback) {
    var cwd = process.cwd();

    fs.readdir(path.join(cwd, '/build/client'), function(err, files) {
      if (err) return callback(err);

      var entryFiles = files.filter(function(file) { return /-entry\.js$/.test(file) });
      if (!entryFiles.length) return callback();

      var entry = {};
      entryFiles.forEach(function(entryFile) {
        entry[entryFile.substr(0, entryFile.length - 9)] = './build/client/' + entryFile;
      });

      //{
      //  pivot: './build/client/pivot-entry.js'
      //}

      webpack({
        context: cwd,
        entry: entry,
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
      }, function(err, stats) {
        if(err) throw new gutil.PluginError("webpack", err);
        if (showStats) {
          gutil.log("[webpack]", stats.toString({
            // output options
          }));
        }
        callback();
      });
    });
  };
};


exports.taskClean = function() {
  return function() {
    del.sync(['./build/**'])
  }
};
