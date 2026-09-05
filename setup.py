from setuptools import setup, find_packages

setup(
    name="layer-notebook-dash",
    version="0.1.0",
    packages=find_packages(),
    include_package_data=True,
    package_data={
        "Layer": ["static/*", "templates/*"],
        "layer": ["static/*", "templates/*"],
    },
)
