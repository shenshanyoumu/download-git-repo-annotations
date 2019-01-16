// download模块用于根据指定URL下载资源，而git-clone基于shell命令克隆代码
var downloadUrl = require("download");
var gitclone = require("git-clone");
var rm = require("rimraf").sync;

// 对外暴露download接口
module.exports = download;

/**
 *
 * @param {String} repo 下载的代码路径和可选的分支
 * @param {String} dest 本地目标路径
 * @param {Object} opts 控制下载行为的配置项
 * @param {Function} fn 下载完成或失败后的回调
 */

function download(repo, dest, opts, fn) {
  if (typeof opts === "function") {
    fn = opts;
    opts = null;
  }

  // 默认使用https下载方式，通过在opts配置clone为true可使用ssh的方式克隆代码
  opts = opts || {};
  var clone = opts.clone || false;

  // 将传入的repo字符串进行归一化处理
  repo = normalize(repo);

  // 针对非direct前缀的repo形式，需要转换为repo的URL路径
  var url = repo.url || getUrl(repo, clone);

  if (clone) {
    gitclone(
      url,
      dest,
      { checkout: repo.checkout, shallow: repo.checkout === "master" },
      function(err) {
        if (err === undefined) {
          rm(dest + "/.git");
          fn();
        } else {
          fn(err);
        }
      }
    );
  } else {
    // 基于http协议下载ZIP文件
    downloadUrl(url, dest, {
      extract: true,
      strip: 1,
      mode: "666",
      headers: { accept: "application/zip" }
    })
      .then(function(data) {
        fn();
      })
      .catch(function(err) {
        fn(err);
      });
  }
}

/**
 * 对传递的仓库路径字符串进行归一化
 *
 * @param {String} repo
 * @return {Object}
 */

function normalize(repo) {
  // 对针对direct类型repo字符串进行解析；同时抽取出仓库地址路径，以及分支字段等
  var regex = /^(?:(direct):([^#]+)(?:#(.+))?)$/;
  var match = regex.exec(repo);

  // direct标识的repo字符串，是完全的仓库路径
  if (match) {
    var url = match[2];
    var checkout = match[3] || "master";

    return {
      type: "direct",
      url: url,
      checkout: checkout
    };
  } else {
    // 基于github|gitlab|bitbucket前缀的repo字符串解析
    regex = /^(?:(github|gitlab|bitbucket):)?(?:(.+):)?([^\/]+)\/([^#]+)(?:#(.+))?$/;
    match = regex.exec(repo);

    // 默认为github仓库类型
    var type = match[1] || "github";

    // 这个源表示开发者自定义的仓库源，比如内部基于gitlab搭建的服务
    var origin = match[2] || null;

    // 这三种仓库类型对外提供的项目路径都会包括owner和name信息
    var owner = match[3];
    var name = match[4];

    // 默认分支为master
    var checkout = match[5] || "master";

    if (origin == null) {
      if (type === "github") origin = "github.com";
      else if (type === "gitlab") origin = "gitlab.com";
      else if (type === "bitbucket") origin = "bitbucket.com";
    }

    return {
      type: type,
      origin: origin,
      owner: owner,
      name: name,
      checkout: checkout
    };
  }
}

/**
 * Adds protocol to url in none specified
 *
 * @param {String} url
 * @return {String}
 */

function addProtocol(origin, clone) {
  // 当采用github/gitlab/bucket等前缀的repo形式时，根据传入的opts参数是否包括clone，调用不同的下载形式
  // 以git@开头形式基于ssh的克隆；而采用https形式使用ZIP下载
  if (!/^(f|ht)tps?:\/\//i.test(origin)) {
    if (clone) origin = "git@" + origin;
    else origin = "https://" + origin;
  }

  return origin;
}

/**
 * Return a zip or git url for a given `repo`.
 *
 * @param {Object} repo
 * @return {String}
 */

function getUrl(repo, clone) {
  var url;

  //为repo的仓库源添加下载协议
  var origin = addProtocol(repo.origin, clone);

  // 如果是git@开头的协议，则添加":"来拼接origin和owner
  if (/^git\@/i.test(origin)) {
    origin = origin + ":";
  } else {
    origin = origin + "/";
  }

  // 如果download函数的opts参数设置了clone属性
  if (clone) {
    url = origin + repo.owner + "/" + repo.name + ".git";
  } else {
    // 基于github仓库类别，且没有设置clone属性，则使用zip下载并解析
    if (repo.type === "github")
      url =
        origin +
        repo.owner +
        "/" +
        repo.name +
        "/archive/" +
        repo.checkout +
        ".zip";
    else if (repo.type === "gitlab")
      url =
        origin +
        repo.owner +
        "/" +
        repo.name +
        "/repository/archive.zip?ref=" +
        repo.checkout;
    else if (repo.type === "bitbucket")
      url =
        origin +
        repo.owner +
        "/" +
        repo.name +
        "/get/" +
        repo.checkout +
        ".zip";
  }

  return url;
}
