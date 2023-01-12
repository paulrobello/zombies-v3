const path = require('path');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const ForkTsCheckerWebpackPlugin = require('fork-ts-checker-webpack-plugin');
const ExtractTextPlugin = require('extract-text-webpack-plugin');

module.exports = {
  entry: './src/index.ts',
  devtool: 'inline-source-map',
  plugins: [
    new HtmlWebpackPlugin({
      filename: 'index.html',
      template: 'src/index.html'
    }),
    new ForkTsCheckerWebpackPlugin(),
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
        use: [{
          loader: 'ts-loader',
          options: {
            transpileOnly: true
          }
        }]
      },
      {
        test: /\.css$/,
        // loader: ExtractTextPlugin.extract(
        //   'style-loader',
        //   'css-loader!postcss-loader'
        // ),
        // exclude: /node_modules/
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
        test: /\.png$/i,
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
