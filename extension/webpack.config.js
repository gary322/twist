const path = require('path');
const CopyWebpackPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const { merge } = require('webpack-merge');

const browser = process.env.BROWSER || 'chrome';
const isDev = process.env.NODE_ENV !== 'production';

const commonConfig = {
  mode: isDev ? 'development' : 'production',
  devtool: isDev ? 'inline-source-map' : false,
  
  entry: {
    'background/service-worker': './background/service-worker.ts',
    'content/inject': './content/inject.ts',
    'popup/popup': './popup/src/index.tsx',
    'options/options': './options/src/index.tsx',
  },
  
  output: {
    path: path.resolve(__dirname, `build/${browser}`),
    filename: '[name].js',
    clean: true,
  },
  
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: [/node_modules/, /tests/],
      },
      {
        test: /\.css$/,
        use: [
          isDev ? 'style-loader' : MiniCssExtractPlugin.loader,
          'css-loader',
        ],
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/,
        type: 'asset/resource',
      },
    ],
  },
  
  resolve: {
    extensions: ['.tsx', '.ts', '.js'],
    alias: {
      '@': path.resolve(__dirname, 'src'),
      '@background': path.resolve(__dirname, 'background'),
      '@content': path.resolve(__dirname, 'content'),
      '@popup': path.resolve(__dirname, 'popup/src'),
      '@options': path.resolve(__dirname, 'options/src'),
      '@types': path.resolve(__dirname, 'types'),
      '@config': path.resolve(__dirname, 'config'),
      '@utils': path.resolve(__dirname, 'src/utils'),
      '@twist/web-sdk': path.resolve(__dirname, 'node_modules/@twist/web-sdk'),
    },
  },
  
  plugins: [
    new MiniCssExtractPlugin({
      filename: '[name].css',
    }),
    
    new HtmlWebpackPlugin({
      template: './popup/public/index.html',
      filename: 'popup/index.html',
      chunks: ['popup/popup'],
    }),
    
    new HtmlWebpackPlugin({
      template: './options/public/index.html',
      filename: 'options/index.html',
      chunks: ['options/options'],
    }),
    
    new HtmlWebpackPlugin({
      template: './onboarding/index.html',
      filename: 'onboarding/index.html',
      chunks: [],
    }),
    
    new CopyWebpackPlugin({
      patterns: [
        {
          from: 'assets',
          to: 'assets',
        },
        {
          from: browser === 'firefox' ? 'firefox/manifest.json' : 'manifest.json',
          to: 'manifest.json',
        },
        {
          from: 'popup/public/styles.css',
          to: 'popup/styles.css',
        },
        {
          from: 'inject/vau-detector.js',
          to: 'inject/vau-detector.js',
        },
      ],
    }),
  ],
  
  optimization: {
    splitChunks: {
      chunks: 'all',
      cacheGroups: {
        vendor: {
          test: /[\\/]node_modules[\\/]/,
          name: 'vendor',
          priority: 10,
        },
      },
    },
  },
};

// Browser-specific configurations
const browserConfigs = {
  chrome: {},
  firefox: {
    output: {
      path: path.resolve(__dirname, 'build/firefox'),
    },
    plugins: [
      ...commonConfig.plugins,
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'firefox/background-wrapper.js',
            to: 'background-wrapper.js',
          },
        ],
      }),
    ],
  },
  safari: {
    output: {
      path: path.resolve(__dirname, 'build/safari'),
    },
    plugins: [
      ...commonConfig.plugins,
      new CopyWebpackPlugin({
        patterns: [
          {
            from: 'safari/Shared/Resources',
            to: '.',
          },
        ],
      }),
    ],
  },
};

module.exports = merge(commonConfig, browserConfigs[browser] || {});