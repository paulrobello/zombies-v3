const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');

// Mode-aware config (AUDIT ARC-007b / SEC-003):
// - `mode` is read from argv (set via `webpack --mode production|development`)
//   and defaults to 'development' when omitted, so webpack doesn't emit a
//   "mode not set" warning and the devtool choice below is always defined.
// - Production ships an EXTERNAL `source-map` file rather than an inlined one,
//   so the prod bundle no longer carries the source map bytes (the original
//   `inline-source-map` was unconditionally applied and inflated the bundle).
// - Development keeps `inline-source-map` for a friendlier debug experience.
module.exports = (env, argv) => {
  const mode = argv.mode || 'development';
  const isProduction = mode === 'production';

  return {
    mode,
    entry: './src/index.ts',
    devtool: isProduction ? 'source-map' : 'inline-source-map',
    plugins: [
      new HtmlWebpackPlugin({
        filename: 'index.html',
        template: 'src/index.html'
      }),
    ],
    devServer: {
      static: './static',
      hot: true
    },
    watchOptions: {
      // for some systems, watching many files can result in a lot of CPU or memory usage
      // https://webpack.js.org/configuration/watch/#watchoptionsignored
      // don't use this pattern, if you have a monorepo with linked packages
      ignored: /node_modules/,
    },
    module: {
      rules: [
        {
          test: /\.ts$/,
          exclude: /node_modules/,
          loader: 'esbuild-loader',
          options: {
            target: 'esnext'
          }
        },
        {
          test: /\.css$/,
          use: ['style-loader', 'css-loader']
        },
        {
          test: /\.(glsl|vs|fs)$/,
          loader: 'ts-shader-loader'
        },
        // {
        //   test: /\.html$/i,
        //   exclude: /node_modules/,
        //   use: 'html-loader'
        // },
        {
          test: /\.(png|jpg|jpeg|gif)$/i,
          exclude: /node_modules/,
          type: 'asset/resource',
          generator: {
            filename: 'img/[name].[contenthash][ext]'
          }
        },
        {
          test: /\.(woff|woff2|ttf)$/i,
          exclude: /node_modules/,
          type: 'asset/resource',
          generator: {
            filename: 'fonts/[name].[contenthash][ext]'
          }
        }
      ]
    },
    resolve: {
      extensions: ['.ts', '.js', '.json']
    },
    output: {
      filename: '[name].bundle.js',
      path: path.resolve(__dirname, 'dist')
    },
    optimization: {
      runtimeChunk: 'single'
    }
  };
};
