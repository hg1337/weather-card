const LitElement = customElements.get("ha-panel-lovelace")
  ? Object.getPrototypeOf(customElements.get("ha-panel-lovelace"))
  : Object.getPrototypeOf(customElements.get("hc-lovelace"));
const html = LitElement.prototype.html;
const css = LitElement.prototype.css;

const weatherIconsDay = {
  clear: "day",
  "clear-night": "night",
  cloudy: "cloudy",
  fog: "cloudy",
  hail: "rainy-7",
  lightning: "thunder",
  "lightning-rainy": "thunder",
  partlycloudy: "cloudy-day-3",
  pouring: "rainy-6",
  rainy: "rainy-5",
  snowy: "snowy-6",
  "snowy-rainy": "rainy-7",
  sunny: "day",
  windy: "cloudy",
  "windy-variant": "cloudy-day-3",
  exceptional: "!!",
};

const weatherIconsNight = {
  ...weatherIconsDay,
  clear: "night",
  sunny: "night",
  partlycloudy: "cloudy-night-3",
  "windy-variant": "cloudy-night-3",
};

const windDirections = [
  "N",
  "NNE",
  "NE",
  "ENE",
  "E",
  "ESE",
  "SE",
  "SSE",
  "S",
  "SSW",
  "SW",
  "WSW",
  "W",
  "WNW",
  "NW",
  "NNW",
  "N",
];

window.customCards = window.customCards || [];
window.customCards.push({
  type: "weather-card",
  name: "Weather Card",
  description: "A custom weather card with animated icons.",
  preview: true,
  documentationURL: "https://github.com/bramkragten/weather-card",
});

const fireEvent = (node, type, detail, options) => {
  options = options || {};
  detail = detail === null || detail === undefined ? {} : detail;
  const event = new Event(type, {
    bubbles: options.bubbles === undefined ? true : options.bubbles,
    cancelable: Boolean(options.cancelable),
    composed: options.composed === undefined ? true : options.composed,
  });
  event.detail = detail;
  node.dispatchEvent(event);
  return event;
};

function hasConfigOrEntityChanged(element, changedProps) {
  if (changedProps.has("_config") || changedProps.has("_forecastEvent")) {
    return true;
  }

  if (!changedProps.has("hass")) {
    return false;
  }

  const oldHass = changedProps.get("hass");
  if (oldHass) {
    return (
      oldHass.states[element._config.entity] !==
        element.hass.states[element._config.entity] ||
      oldHass.states["sun.sun"] !== element.hass.states["sun.sun"]
    );
  }

  return true;
}

class WeatherCard extends LitElement {
  static get properties() {
    return {
      _config: {},
      _forecastEvent: {},
      hass: {},
    };
  }

  static getConfigForm() {
    return {
      schema: [
        {
          name: "entity",
          required: true,
          selector: { entity: { domain: "weather" } },
        },
        {
          name: "name",
          selector: { text: {} },
        },
        { name: "current", default: true, selector: { boolean: {} } },
        { name: "details", default: true, selector: { boolean: {} } },
        { name: "forecast", default: true, selector: { boolean: {} } },
        {
          name: "forecast_type",
          default: "daily",
          selector: {
            select: {
              options: [
                { value: "hourly", label: "Hourly" },
                { value: "daily", label: "Daily" },
              ],
            },
          },
        },
        { name: "number_of_forecasts", default: 5, selector: { number: {} } },
      ],
    };
  }

  static getStubConfig(hass, unusedEntities, allEntities) {
    let entity = unusedEntities.find((eid) => eid.split(".")[0] === "weather");
    if (!entity) {
      entity = allEntities.find((eid) => eid.split(".")[0] === "weather");
    }
    return { entity };
  }

  setConfig(config) {
    if (!config.entity) {
      throw new Error("Please define a weather entity");
    }
    this._config = { forecast_type: "daily", ...config };
  }

  _needForecastSubscription() {
    return (
      this._config &&
      this._config.forecast !== false &&
      this._config.forecast_type &&
      this._config.forecast_type !== "legacy"
    );
  }

  _unsubscribeForecastEvents() {
    if (this._subscribed) {
      this._subscribed.then((unsub) => unsub());
      this._subscribed = undefined;
    }
  }

  async _subscribeForecastEvents() {
    this._unsubscribeForecastEvents();
    if (
      !this.isConnected ||
      !this.hass ||
      !this._config ||
      !this._needForecastSubscription()
    ) {
      return;
    }

    this._subscribed = this.hass.connection.subscribeMessage(
      (event) => {
        this._forecastEvent = event;
      },
      {
        type: "weather/subscribe_forecast",
        forecast_type: this._config.forecast_type,
        entity_id: this._config.entity,
      }
    );
  }

  connectedCallback() {
    super.connectedCallback();
    if (this.hasUpdated && this._config && this.hass) {
      this._subscribeForecastEvents();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._unsubscribeForecastEvents();
  }

  shouldUpdate(changedProps) {
    return hasConfigOrEntityChanged(this, changedProps);
  }

  updated(changedProps) {
    if (!this.hass || !this._config) {
      return;
    }
    if (changedProps.has("_config") || !this._subscribed) {
      this._subscribeForecastEvents();
    }
  }

  render() {
    if (!this._config || !this.hass) {
      return html``;
    }

    this.numberElements = 0;

    const lang = this.hass.selectedLanguage || this.hass.language;
    const stateObj = this.hass.states[this._config.entity];

    if (!stateObj) {
      return html`
        <style>
          .not-found {
            flex: 1;
            background-color: var(--warning-color);
            padding: 8px;
          }
        </style>
        <ha-card>
          <div class="not-found">
            Entity not available: ${this._config.entity}
          </div>
        </ha-card>
      `;
    }

    return html`
      <ha-card @click="${this._handleClick}">
        ${this._config.current !== false ? this.renderCurrent(stateObj) : ""}
        ${this._config.details !== false
          ? this.renderDetails(stateObj, lang)
          : ""}
        ${this._config.forecast !== false
          ? this.renderForecast(
              this._forecastEvent || {
                forecast: stateObj.attributes.forecast,
                type: this._config.hourly_forecast ? "hourly" : "daily",
              },
              lang
            )
          : ""}
      </ha-card>
    `;
  }

  renderCurrent(stateObj) {
    this.numberElements++;

    return html`
      <div class="current ${this.numberElements > 1 ? "spacer" : ""}">
        <span
          class="icon bigger"
          style="background: none, url('${this.getWeatherIcon(
            stateObj.state.toLowerCase(),
            this.hass.states["sun.sun"]
          )}') no-repeat; background-size: contain;"
          >${stateObj.state}
        </span>
        ${this._config.name
          ? html` <span class="title"> ${this._config.name} </span> `
          : ""}
        <span class="temp"
          >${this.getUnit("temperature") == "°F"
            ? Math.round(stateObj.attributes.temperature)
            : stateObj.attributes.temperature}</span
        >
        <span class="tempc"> ${this.getUnit("temperature")}</span>
      </div>
    `;
  }

  renderDetails(stateObj, lang) {
    const sun = this.hass.states["sun.sun"];
    let next_rising;
    let next_setting;

    if (sun) {
      next_rising = new Date(sun.attributes.next_rising).toLocaleTimeString(
        lang,
        {
          hour: "2-digit",
          minute: "2-digit",
        }
      );
      next_setting = new Date(sun.attributes.next_setting).toLocaleTimeString(
        lang,
        {
          hour: "2-digit",
          minute: "2-digit",
        }
      );
    }

    this.numberElements++;

    return html`
      <ul class="variations ${this.numberElements > 1 ? "spacer" : ""}">
        <li>
          <ha-icon icon="mdi:water-percent"></ha-icon>
          ${stateObj.attributes.humidity}<span class="unit"> % </span>
        </li>
        <li>
          <ha-icon icon="mdi:weather-windy"></ha-icon> ${windDirections[
            parseInt((stateObj.attributes.wind_bearing + 11.25) / 22.5)
          ]}
          ${stateObj.attributes.wind_speed}<span class="unit">
            ${this.getUnit("length")}/h
          </span>
        </li>
        <li>
          <ha-icon icon="mdi:gauge"></ha-icon>
          ${stateObj.attributes.pressure}
          <span class="unit"> ${this.getUnit("air_pressure")} </span>
        </li>
        <li>
          <ha-icon icon="mdi:weather-fog"></ha-icon> ${stateObj.attributes
            .visibility}<span class="unit"> ${this.getUnit("length")} </span>
        </li>
        ${next_rising
          ? html`
              <li>
                <ha-icon icon="mdi:weather-sunset-up"></ha-icon>
                ${next_rising}
              </li>
            `
          : ""}
        ${next_setting
          ? html`
              <li>
                <ha-icon icon="mdi:weather-sunset-down"></ha-icon>
                ${next_setting}
              </li>
            `
          : ""}
      </ul>
    `;
  }

  renderForecast(forecast, lang) {
    if (!forecast || !forecast.forecast || forecast.forecast.length === 0) {
      return html``;
    }

    this.numberElements++;
    return html`
      <div class="forecast clear ${this.numberElements > 1 ? "spacer" : ""}">
        ${forecast.forecast
          .slice(
            0,
            this._config.number_of_forecasts
              ? this._config.number_of_forecasts
              : 5
          )
          .map(
            (daily) => html`
              <div class="day">
                <div class="dayname">
                  ${forecast.type === "hourly"
                    ? new Date(daily.datetime).toLocaleTimeString(lang, {
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : new Date(daily.datetime).toLocaleDateString(lang, {
                        weekday: "short",
                      })}
                </div>
                <i
                  class="icon"
                  style="background: none, url('${this.getWeatherIcon(
                    daily.condition.toLowerCase()
                  )}') no-repeat; background-size: contain"
                ></i>
                <div class="highTemp">
                  ${daily.temperature}${this.getUnit("temperature")}
                </div>
                ${daily.templow !== undefined
                  ? html`
                      <div class="lowTemp">
                        ${daily.templow}${this.getUnit("temperature")}
                      </div>
                    `
                  : ""}
                ${!this._config.hide_precipitation &&
                daily.precipitation !== undefined &&
                daily.precipitation !== null
                  ? html`
                      <div class="precipitation">
                        ${Math.round(daily.precipitation * 10) / 10}
                        ${this.getUnit("precipitation")}
                      </div>
                    `
                  : ""}
                ${!this._config.hide_precipitation &&
                daily.precipitation_probability !== undefined &&
                daily.precipitation_probability !== null
                  ? html`
                      <div class="precipitation_probability">
                        ${Math.round(daily.precipitation_probability)}
                        ${this.getUnit("precipitation_probability")}
                      </div>
                    `
                  : ""}
              </div>
            `
          )}
      </div>
    `;
  }

  getWeatherIcon(condition, sun) {
    return `${
      this._config.icons
        ? this._config.icons
        : "https://cdn.jsdelivr.net/gh/bramkragten/weather-card/dist/icons/"
    }${
      sun && sun.state == "below_horizon"
        ? weatherIconsNight[condition]
        : weatherIconsDay[condition]
    }.svg`;
  }

  getUnit(measure) {
    const lengthUnit = this.hass.config.unit_system.length;
    switch (measure) {
      case "air_pressure":
        return lengthUnit === "km" ? "hPa" : "inHg";
      case "length":
        return lengthUnit;
      case "precipitation":
        return lengthUnit === "km" ? "mm" : "in";
      case "precipitation_probability":
        return "%";
      default:
        return this.hass.config.unit_system[measure] || "";
    }
  }

  _handleClick() {
    fireEvent(this, "hass-more-info", { entityId: this._config.entity });
  }

  getCardSize() {
    return 3;
  }

  static get styles() {
    return css`
      ha-card {
        cursor: pointer;
        margin: auto;
        overflow: hidden;
        padding-top: 0.75em;
        padding-bottom: 0.75em;
        padding-left: 0.75em;
        padding-right: 0.75em;
        position: relative;
      }

      .spacer {
        padding-top: 1em;
      }

      .clear {
        clear: both;
      }

      .title {
        position: absolute;
        left: 3em;
        font-weight: 300;
        font-size: 3em;
        color: var(--primary-text-color);
      }

      .temp {
        font-weight: 300;
        font-size: 3em;
        color: var(--primary-text-color);
        position: absolute;
        right: 1.25em;
      }

      .tempc {
        font-weight: 300;
        font-size: 1.5em;
        vertical-align: super;
        color: var(--primary-text-color);
        position: absolute;
        right: 1em;
        margin-top: -9px;
        margin-right: 7px;
      }

      @media (max-width: 460px) {
        .title {
          font-size: 2.2em;
          left: 4em;
        }
        .temp {
          font-size: 3em;
        }
        .tempc {
          font-size: 1em;
        }
      }

      .current {
        padding: 1.2em 0;
        margin-bottom: 1.7em;
      }

      .variations {
        display: flex;
        flex-flow: row wrap;
        justify-content: space-between;
        font-weight: 300;
        color: var(--primary-text-color);
        list-style: none;
        padding: 0 1em;
        margin: 0;
      }

      .variations ha-icon {
        height: 22px;
        margin-right: 5px;
        color: var(--paper-item-icon-color);
      }

      .variations li {
        flex-basis: auto;
        width: 50%;
      }

      .variations li:nth-child(2n) {
        text-align: right;
      }

      .variations li:nth-child(2n) ha-icon {
        margin-right: 0;
        margin-left: 8px;
        float: right;
      }

      .unit {
        font-size: 0.8em;
      }

      .forecast {
        width: 100%;
        margin: 0 auto;
        display: flex;
      }

      .day {
        flex: 1;
        display: block;
        text-align: center;
        color: var(--primary-text-color);
        border-right: 0.1em solid #d9d9d9;
        box-sizing: border-box;
      }

      .dayname {
        text-transform: uppercase;
      }

      .forecast .day:first-child {
        margin-left: 0;
      }

      .forecast .day:nth-last-child(1) {
        border-right: none;
        margin-right: 0;
      }

      .highTemp {
        font-weight: bold;
      }

      .lowTemp {
        color: var(--secondary-text-color);
      }

      .precipitation {
        color: var(--primary-text-color);
        font-weight: 300;
      }

      .icon.bigger {
        width: 6em;
        height: 6em;
        margin-top: -2.5em;
        position: absolute;
        left: 0.5em;
      }

      .icon {
        width: 50px;
        height: 50px;
        margin-right: 5px;
        display: inline-block;
        vertical-align: middle;
        background-size: contain;
        background-position: center center;
        background-repeat: no-repeat;
        text-indent: -9999px;
      }

      .weather {
        font-weight: 300;
        font-size: 1.5em;
        color: var(--primary-text-color);
        text-align: left;
        position: absolute;
        top: -0.5em;
        left: 6em;
        word-wrap: break-word;
        width: 30%;
      }
    `;
  }
}
customElements.define("weather-card", WeatherCard);
