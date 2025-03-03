var carwings = require("carwings");

var Service, Characteristic;
var carwingsSession = null;

module.exports = function (homebridge) {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;

  homebridge.registerAccessory(
    "homebridge-carwings",
    "Carwings",
    CarwingsAccessory,
  );
};

var base64regex =
  /^(?:[A-Z0-9+\/]{4})*(?:[A-Z0-9+\/]{2}==|[A-Z0-9+\/]{3}=|[A-Z0-9+\/]{4})$/i;

var email, password, region;
function loginCarwings() {
  carwings.loginSession(email, password, region).then(function (session) {
    carwingsSession = session;
    carwings.batteryStatusCheckRequest(carwingsSession);
  });
}

function CarwingsAccessory(log, config) {
  this.log = log;
  this.config = config;
  this.name = config["name"];
  email = config["email"];
  password = config["password"];
  region = config["region"];
  if (base64regex.test(password)) {
    password = Buffer.from(password, "base64");
  }

  loginCarwings();

  this.battery = new Service.BatteryService(this.name);

  this.battery
    .getCharacteristic(Characteristic.BatteryLevel)
    .on("get", this.getLevel.bind(this));

  this.battery
    .getCharacteristic(Characteristic.ChargingState)
    .on("get", this.getCharging.bind(this));

  this.heater = new Service.HeaterCooler(this.name);

  this.heater
    .getCharacteristic(Characteristic.Active)
    .on("get", this.getHVAC.bind(this))
    .on("set", this.setHVAC.bind(this));

  this.heater
    .getCharacteristic(Characteristic.CurrentTemperature)
    .on("get", this.getCabinTemp.bind(this));

  var updateInterval = config["updateInterval"]
    ? config["updateInterval"]
    : 600000;

  if (updateInterval != "never") {
    setInterval(function () {
      carwings
        .batteryStatusCheckRequest(carwingsSession)
        .then(function (checkStatus) {
          console.log("Got LEAF request on interval", checkStatus);
          if (checkStatus.status == 401) {
            loginCarwings();
          }
        });
    }, 600000);
  }
}

CarwingsAccessory.prototype.getLevel = function (callback) {
  if (!carwingsSession) {
    return;
  }
  //console.log(this.battery.getCharacteristic(Characteristic.BatteryLevel));
  var _this = this;
  carwings.batteryRecords(carwingsSession).then(function (status) {
    // console.log(status);
    if (status.status == 401) {
      loginCarwings();
    }
    carwings.batteryStatusCheckRequest(carwingsSession);
    /*_this.battery.getCharacteristic(Characteristic.BatteryLevel).setProp({
      maxValue: status.BatteryStatusRecords.BatteryStatus.BatteryCapacity
    });*/
    //_this.battery.getCharacteristic(Characteristic.BatteryLevel).props.maxValue = parseInt(status.BatteryStatusRecords.BatteryStatus.BatteryCapacity);

    var chargePercent = 0;
    if (status.BatteryStatusRecords?.BatteryStatus?.SOC?.Value) {
      chargePercent = parseInt(
        status.BatteryStatusRecords.BatteryStatus.SOC.Value,
      );
    } else {
      chargePercent = parseInt(
        (status.BatteryStatusRecords.BatteryStatus.BatteryRemainingAmount /
          12) *
          100,
      );
      if (chargePercent > 100) chargePercent = 100;
    }
    console.log("LEAF charge percent = ", chargePercent);
    callback(null, chargePercent);
  });
};

CarwingsAccessory.prototype.getCharging = function (callback) {
  if (!carwingsSession) {
    return;
  }
  carwings.batteryRecords(carwingsSession).then(function (status) {
    if (status.status == 401) {
      loginCarwings();
    }
    callback(
      null,
      status.BatteryStatusRecords.BatteryStatus.BatteryChargingStatus !=
        "NOT_CHARGING",
    );
  });
};

CarwingsAccessory.prototype.getHVAC = function (callback) {
  if (!carwingsSession) {
    return;
  }
  carwings.hvacStatus(carwingsSession).then(function (status) {
    if (status.status == 401) {
      loginCarwings();
    }
    callback(
      null,
      status.RemoteACRecords &&
        status.RemoteACRecords.RemoteACOperation !== "STOP",
    );
  });
};

CarwingsAccessory.prototype.getCabinTemp = function (callback) {
  if (!carwingsSession) {
    return;
  }
  carwings.cabinTemp(carwingsSession).then(function (status) {
    console.log(status);
    if (status.status == 401) {
      loginCarwings();
    }
    callback(null, status.Inc_temp);
  });
};

CarwingsAccessory.prototype.setHVAC = function (on, callback) {
  if (!carwingsSession) {
    return;
  }
  if (on) {
    carwings.hvacOn(carwingsSession).then(function (status) {
      if (status.status == 401) {
        loginCarwings();
      }
      callback(null, true);
    });
  } else {
    carwings.hvacOff(carwingsSession).then(function (status) {
      if (status.status == 401) {
        loginCarwings();
      }
      callback(null, false);
    });
  }
};

CarwingsAccessory.prototype.getServices = function () {
  return [this.battery, this.hvac, this.heater, this.switch];
};
