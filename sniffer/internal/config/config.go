package config

import (
	"log"
	"strings"

	"github.com/spf13/viper"
)

type Config struct {
	Interface     string   `mapstructure:"interface"`
	Promiscuous   bool     `mapstructure:"promiscuous"`
	SnapLen       int      `mapstructure:"snaplen"`
	Filter        string   `mapstructure:"filter"`
	HEPTarget     string   `mapstructure:"hep_target"`
	HEPID         uint32   `mapstructure:"hep_id"`
	LogLevel      string   `mapstructure:"log_level"`
	HEPListen     string   `mapstructure:"hep_listen"`
	HEPPeers      []string `mapstructure:"hep_peers"`
	RelayUpstream bool     `mapstructure:"relay_upstream"`
	MappingTTL    int      `mapstructure:"mapping_ttl"`
}

func LoadConfig() (*Config, error) {
	viper.SetConfigName("config")
	viper.SetConfigType("yaml")
	viper.AddConfigPath(".")
	viper.AddConfigPath("./config")

	viper.SetDefault("interface", "lo0") // Default to loopback for dev
	viper.SetDefault("promiscuous", false)
	viper.SetDefault("snaplen", 65535)
	viper.SetDefault("filter", "udp port 5060 or udp portrange 10000-20000") // SIP + RTP
	viper.SetDefault("hep_target", "127.0.0.1:9060")
	viper.SetDefault("hep_id", 2001)
	viper.SetDefault("log_level", "info")
	viper.SetDefault("hep_listen", "")        // empty means disabled
	viper.SetDefault("hep_peers", []string{}) // empty means no peers
	viper.SetDefault("relay_upstream", false)
	viper.SetDefault("mapping_ttl", 3600) // 1 hour

	viper.SetEnvPrefix("SNIFFER")
	viper.SetEnvKeyReplacer(strings.NewReplacer(".", "_"))
	viper.AutomaticEnv()

	if err := viper.ReadInConfig(); err != nil {
		if _, ok := err.(viper.ConfigFileNotFoundError); !ok {
			return nil, err
		}
		log.Println("No config file found, using defaults")
	}

	var config Config
	if err := viper.Unmarshal(&config); err != nil {
		return nil, err
	}

	return &config, nil
}
