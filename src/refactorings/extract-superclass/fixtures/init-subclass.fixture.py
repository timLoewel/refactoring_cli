params = {"file": "fixture.py", "target": "PluginBase", "superclassName": "Registry", "methods": "get_label,__init_subclass__"}

_registry = []


class PluginBase:
    name = "base"

    def __init_subclass__(cls, plugin_name="unnamed", **kwargs):
        super().__init_subclass__(**kwargs)
        _registry.append(plugin_name)

    def get_label(self) -> str:
        return f"Plugin: {type(self).__name__}"


class PluginA(PluginBase, plugin_name="alpha"):
    pass


class PluginB(PluginBase, plugin_name="beta"):
    pass


def main() -> str:
    a = PluginA()
    b = PluginB()
    return a.get_label() + " | " + b.get_label()
