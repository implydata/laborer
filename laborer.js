'use strict';

var browserify = require('browserify');
var source = require('vinyl-source-stream');
var buffer = require('vinyl-buffer');
var path = require('path');

var gulp = require('gulp');
var sass = require('gulp-sass');
var scsslint = require('gulp-scss-lint');
var postcss = require('gulp-postcss');
var autoprefixer = require('autoprefixer-core');
var tsc = require('gulp-typescript');
var concat = require('gulp-concat');
var tslint = require('gulp-tslint');
var foreach = require('gulp-foreach');
var sourcemaps = require('gulp-sourcemaps');

var merge = require('merge-stream');
var debug = require('gulp-debug');
var del = require('del');
var typescript = require('typescript');

var mocha = require('gulp-mocha');

var tsLintConfig = require('./tslint');
var gr = require('./gulp-reporters');


exports.taskStyle = function(styleName) {
  return function() {
    var errorTexts = [];

    return gulp.src('./src/client/**/*.scss')
      .pipe(scsslint({
        config: './src/lint/sass-lint.yml',
        customReport: gr.sassLintReporterFactory({
          errorTexts: errorTexts
        })
      }))
      .pipe(sass().on('error', gr.sassErrorFactory({
        errorTexts: errorTexts
      })))
      .pipe(postcss([
        autoprefixer({
          browsers: ['> 1%', 'last 3 versions', 'Firefox ESR', 'Opera 12.1'],
          remove: false // If you have no legacy code, this option will make Autoprefixer about 10% faster.
        })
      ]))
      .pipe(concat(styleName))
      .pipe(gulp.dest('./build/public'))
      .on('finish', function() {
        gr.writeErrors('./webstorm/errors', errorTexts);
      });
  };
};


exports.taskClientTypeScript = function(opt) {
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

    return merge(sourceFiles, typeFiles)
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
      ))
      //.pipe(sourcemaps.write('.', { includeContent: false, sourceRoot: '../client' }))
      .pipe(gulp.dest('./build/'));
  };
};


exports.taskServerTypeScript = function(opt) {
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

    return merge(sourceFiles, typeFiles)
      .pipe(sourcemaps.init())
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
      ))
      .pipe(sourcemaps.write('.', {
        includeContent: false,
        sourceRoot: '../../src/server'
      }))
      .pipe(gulp.dest('./build'));
  };
};


var mochaParams = {
  reporter: 'spec'
}

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


exports.taskClientBundle = function() {
  return function() {
    return gulp.src('./build/client/*.js')
      .pipe(foreach(function(stream, file) {
        // From: https://github.com/gulpjs/gulp/blob/master/docs/recipes/browserify-uglify-sourcemap.md
        var b = browserify({
          //debug: true,
          entries: file.path
        });

        return b.bundle()
          .pipe(source(path.basename(file.path)))
          .pipe(buffer());
      }))
      .pipe(gulp.dest('./build/public'));
  };
};


exports.taskClean = function() {
  return function(cb) {
    del(['./build/**'], cb);
  }
};
