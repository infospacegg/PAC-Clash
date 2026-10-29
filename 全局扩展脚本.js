// Define main function (script entry)
function main(config, profileName) {
  // ================= 基础参数配置 =================
  const groupCount = 6; // 容器/浏览器节点数量 (node-1 ~ node-6)
  const basePort = 48311; // 起始监听端口 (48311 ~ 48316)
  const nodeFilter = "(?i)(AI|Research|US|TW|美国|台湾)"; // 策略组节点筛选正则

  // 1. 开启节点选择持久化 (避免每次更新订阅或重启后恢复默认节点)
  config["profile"] = {
    ...(config["profile"] || {}),
    "store-selected": true
  };

  // ================= 核心修复：Fake-IP 过滤 =================
  // 避免钉钉等国内敏感应用拿到 198.18.x.x 虚拟 IP 触发阿里安全风控拦截
  if (!config["dns"]) config["dns"] = {};
  const dingtalkFakeIp = [
    "+.dingtalk.com",
    "+.dingtalkapps.com",
    "+.laiwang.com",
    "+.alicdn.com",
    "+.aliyun.com"
  ];
  config["dns"]["fake-ip-filter"] = Array.from(new Set([
    ...dingtalkFakeIp,
    ...(config["dns"]["fake-ip-filter"] || [])
  ]));

  // ================= 置顶直连规则 =================
  const prependRules = [
    // 1. 钉钉进程绝对直连 (内核级别进程绕过)
    "PROCESS-NAME,DingTalk.exe,DIRECT",
    "PROCESS-NAME,dingtalk.exe,DIRECT",

    // 2. 钉钉及阿里关键域名直连
    "DOMAIN-SUFFIX,dingtalk.com,DIRECT",
    "DOMAIN-SUFFIX,dingtalkapps.com,DIRECT",
    "DOMAIN-SUFFIX,laiwang.com,DIRECT",
    "DOMAIN-KEYWORD,dingtalk,DIRECT",

    // 3. 内网地址 (带 no-resolve 避免内网地址触发无谓的 DNS 解析延迟)
    "IP-CIDR,10.0.0.0/8,DIRECT,no-resolve",
    "IP-CIDR,172.16.0.0/12,DIRECT,no-resolve",
    "IP-CIDR,192.168.0.0/16,DIRECT,no-resolve",
    "IP-CIDR,127.0.0.0/8,DIRECT,no-resolve",

    // 4. 原有自定义直连域名
    "DOMAIN-KEYWORD,openai365.top,DIRECT",
    "DOMAIN-SUFFIX,tuna.tsinghua.edu.cn,DIRECT",
    "DOMAIN-SUFFIX,mirrors.aliyun.com,DIRECT",
    "DOMAIN-SUFFIX,pypi.doubanio.com,DIRECT",
    "DOMAIN-SUFFIX,cron-job.org,DIRECT",
    "DOMAIN-SUFFIX,qwen.ai,DIRECT",
    "DOMAIN-SUFFIX,wwitechs.com,DIRECT"
  ];
  config["rules"] = [...prependRules, ...(config["rules"] || [])];

  // 3. 动态批量构建 node-1 到 node-6 策略组
  const groupNames = Array.from({ length: groupCount }, (_, i) => `node-${i + 1}`);
  const newGroups = groupNames.map(name => ({
    name: name,
    type: "select",
    "include-all": true,
    filter: nodeFilter,
    proxies: ["DIRECT"] // 兜底防止订阅无匹配节点时导致内核报错
  }));

  // 策略组安全合并去重 (若已有同名组则过滤，防止内核报重复组名错误)
  const existingGroupNames = new Set((config["proxy-groups"] || []).map(g => g.name));
  const filteredNewGroups = newGroups.filter(g => !existingGroupNames.has(g.name));
  config["proxy-groups"] = [...(config["proxy-groups"] || []), ...filteredNewGroups];

  // 4. 动态批量构建 48311 ~ 48316 mixed listeners
  // 必须绑定 0.0.0.0，以确保 Docker 容器能通过宿主机 IP 或 host.docker.internal 连入
  const newListeners = groupNames.map((name, index) => ({
    name: name,
    type: "mixed",
    port: basePort + index,
    listen: "0.0.0.0",
    proxy: name
  }));

  // listeners 安全合并去重
  const existingListeners = new Set((config["listeners"] || []).map(l => l.name));
  const filteredListeners = newListeners.filter(l => !existingListeners.has(l.name));
  config["listeners"] = [...(config["listeners"] || []), ...filteredListeners];

  return config;
}
