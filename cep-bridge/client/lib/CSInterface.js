(function () {
  function CSInterface() {}

  CSInterface.prototype.evalScript = function (script, callback) {
    var done = typeof callback === "function" ? callback : function () {};
    if (
      typeof window !== "undefined" &&
      window.__adobe_cep__ &&
      typeof window.__adobe_cep__.evalScript === "function"
    ) {
      window.__adobe_cep__.evalScript(script, done);
      return;
    }

    done("EvalScript error: CEP runtime unavailable");
  };

  window.CSInterface = CSInterface;
})();
